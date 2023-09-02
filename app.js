
const ant = require('ant-plus');
const osc = require('osc');
const config = require(process.cwd() + '/config.json');
const fs = require('fs');

const OUTPUT_FILE_PATH = 'sessiondata.csv';
const RECONNECT_DELAY = config.reconnect_delay;

const osc_port = new osc.UDPPort({ remotePort: config.output_port });
osc_port.on('ready', () => {
    console.info(`Output port ready! (${config.output_port})`);
});
osc_port.open();

let session_start_time = new Date();
let last_bpm = 0;
let avg_bpm = [];
let max_bpm = 0;
let min_bpm = 0;

function normalize(n, min, max) {
    return (n - min) / (max - min);
}

function sendBPM(bpm) {
    if (bpm != last_bpm) {
        if (bpm > max_bpm)
            max_bpm = bpm;
        if (bpm && (!min_bpm || bpm < min_bpm))
            min_bpm = bpm;

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
let connected = null;
let reconnect_timeout = null;
// let reconnect_failed_timeout = null;

if (config.ant_version === 3) stick = new ant.GarminStick3();
else if (config.ant_version === 2) stick = new ant.GarminStick2();
else console.error('Invalid stick version in config! Must be either 2 or 3.');

let hr_sensor = new ant.HeartRateSensor(stick);

function push_hr_to_avg() {
    if (last_bpm) avg_bpm.push(last_bpm);
}

hr_sensor.on('hbdata', (data) => {
    if (connected === null)
        console.log('Connected!');
    else if (connected === false)
        console.log('Reconnected!');

    connected = true;

    if (reconnect_timeout) {
        clearTimeout(reconnect_timeout);
        reconnect_timeout = null;
    }

    // if (reconnect_failed_timeout) {
    //     clearTimeout(reconnect_failed_timeout);
    //     reconnect_failed_timeout = null;
    // }

    sendBPM(data.ComputedHeartRate);
});

// hr_sensor.on('attach', () => {
//     console.log('attach');
// });

hr_sensor.on('eventData', (data) => {
    console.log('eventData', data);
});

// hr_sensor.on('attached', () => {
//     if (connected === null)
//         console.log('Connected!');
//     else if (connected === false)
//         console.log('Reconnected!');
//     connected = true;
// });

function reconnect_handler() {
    console.log('Reconnecting...');
    hr_sensor.attach(0, 0);
}

hr_sensor.on('detached', () => {
    connected = false;
    console.log(`Lost connection!`);
    reconnect_timeout = setTimeout(reconnect_handler, RECONNECT_DELAY * 1000);
});

// stick.on('shutdown', (data) => {
//     console.log('shutting down', data);
// });

stick.on('startup', () => {
    // console.info('ANT+ Stick started up!');
    hr_sensor.attach(0, 0);
    setInterval(push_hr_to_avg, 60 * 1000);
});

if (!stick.open()) {
    console.log('ANT+ Stick not found!');
}
// else {
//     console.info('Connected to ANT+ stick!');
// }

let saved_session_data = false;

function on_exit() {
    if (!saved_session_data) {
        console.log('Saving session data...');
        saved_session_data = true;
        let session_end_time = new Date();
        let average_bpm = 0;
        for (let i = 0; i < avg_bpm.length; i++)
            average_bpm += avg_bpm[i];
        average_bpm /= avg_bpm.length;
        if (!fs.existsSync(OUTPUT_FILE_PATH))
            fs.appendFileSync(OUTPUT_FILE_PATH, 'START_TIME,START_DATE,END_TIME,END_DATE,AVG_BPM,MAX_BPM,MIN_BPM\n');
        let text = `${session_start_time.toLocaleTimeString()},${session_start_time.toLocaleDateString()},${session_end_time.toLocaleTimeString()},${session_end_time.toLocaleDateString()},${average_bpm},${max_bpm},${min_bpm}\n`;
        fs.appendFileSync(OUTPUT_FILE_PATH, text);
        if (DEBUG) console.log(text);
    }
    process.exit(0);
}

process.on('exit', on_exit);
process.on('SIGINT', on_exit);
process.on('SIGTERM', on_exit);