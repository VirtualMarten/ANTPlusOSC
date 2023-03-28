
const ant = require('ant-plus');
const osc = require('osc');
const config = require(process.cwd() + '/config.json');

const TIMEOUT = config.timeout; // Time in milliseconds that it takes to consider the device disconnected.
const RECONNECT_DELAY = config.reconnect_delay; // Time in milliseconds to wait before attempting to reconnect.

const osc_port = new osc.UDPPort({ remotePort: config.output_port });
osc_port.on('ready', () => {
    console.info(`Output port ready! (${config.output_port})`);
});
osc_port.open();

let last_bpm = 0;

function normalize(n, min, max) {
    return (n - min) / (max - min);
}

function sendBPM(bpm) {
    if (bpm != last_bpm) {
        let packets = [];
        for (let output of config.outputs) {
            if (output.error == true) continue;

            let value = 0;
            let [source, type] = output.type.split(':', 2);

            if (source == 'bpm') {
                value = bpm;
            }
            else {
                console.error(`Error on output ${output.path}:\nType must be bpm, as that is all that is supported at this time.`);
                output['error'] = true;
                continue;
            }

            if (type == 'f' || type == 'float') {
                if (output.normalization_range) {
                    const [min, max] = output.normalization_range.split('-', 2);
                    value = normalize(value, min, max);
                }
            }
            else if (type == 'i' || type == 'int') {
                value = Math.floor(value);
            }
            else if (type == 'digits') {
                if (output.digits_max)
                    value = Math.min(Math.floor(value), output.digits_max);
                else value = Math.floor(value);
                value = value.toString().split('').map(Number);

                const separator = (output.digit_subpaths) ? '/' : '_';
                for (let i = 0; i < value.length; i++) {
                    packets.push({
                        address: output.path + separator + (i + 1),
                        args: [ { type: 'i', value: value[i] } ]
                    })
                }

                continue;
            }
            else {
                console.error(`Error on output ${output.path}:\nData type must be either float, int or .`);
                output['error'] = true;
                continue;
            }

            packets.push({
                address: output.path,
                args: [ { type: type, value: value } ]
            });
        }

        if (packets.length > 0) {
            osc_port.send({
                timeTag: osc.timeTag(),
                packets: packets
            });
        }

        last_bpm = bpm;
    }
}

// ANT+ setup

let stick = null;

if (config.ant_version === 3) stick = new ant.GarminStick3();
else if (config.ant_version === 2) stick = new ant.GarminStick2();
else return console.error('Invalid stick version in config! Must be either 2 or 3.');

let hr_sensor = new ant.HeartRateSensor(stick);
let hr_pulses = 0;
let hr_connected = null;
let hr_timeout = null;
let hr_reconnect_timeout = null;

function hr_reconnect_cb() {
    if (hr_connected !== true) {
        console.log('Attempting to reconnect HR...');
        try { hr_sensor.attach(0, 0); } catch (e) {  }
        hr_reconnect_timeout = setTimeout(hr_reconnect_cb, RECONNECT_DELAY);
    }
}

function hr_timeout_cb() {
    if (hr_pulses == 0) {
        if (hr_connected === true) {
            console.log('HR disconnected!');
            sendBPM(0);
            hr_connected = false;
            if (hr_reconnect_timeout != null)
                clearTimeout(hr_reconnect_timeout);
            hr_reconnect_timeout = setTimeout(hr_reconnect_cb, RECONNECT_DELAY);
        }
    }
    else if (hr_connected === false) {
        console.log('HR reconnected!')
        hr_connected = true;
        if (hr_reconnect_timeout != null)
            clearTimeout(hr_reconnect_timeout);
    }

    hr_pulses = 0;
    setTimeout(hr_timeout_cb, TIMEOUT);
}

hr_sensor.on('hbdata', (data) => {
    if (hr_connected === null) {
        hr_connected = true;
        console.log('HR connected!');
    }

    sendBPM(data.ComputedHeartRate);
    hr_pulses += 1;

    if (TIMEOUT > 0) {
        if (hr_timeout === null) {
            hr_timeout = setTimeout(hr_timeout_cb, TIMEOUT);
        }
        else {
            clearTimeout(hr_timeout);
            hr_timeout = setTimeout(hr_timeout_cb, TIMEOUT);
        }
    }
});

stick.on('startup', () => {
    console.info('ANT+ Stick started up!');
    hr_sensor.attach(0, 0);
});

if (!stick.open()) {
    console.log('ANT+ Stick not found!');
} else {
    console.info('Connected to ANT+ stick!');
}