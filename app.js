'use strict';

const ant = require('ant-plus');
const osc = require('osc');
const config = require(process.cwd() + '/config.json');

const TIMEOUT = 10000 // Time in milliseconds that it takes to consider the device disconnected.
const RECONNECT_DELAY = 15000 // Time in milliseconds to wait before attempting to reconnect.

const osc_port = new osc.UDPPort({ remotePort: config.output_port });
osc_port.on('ready', () => {
    console.info(`Output port ready! (${config.output_port})`);
});
osc_port.open();

let last_bpm = 0;

function sendBPM(bpm) {
    if (bpm != last_bpm) {
        osc_port.send({
            timeTag: osc.timeTag(),
            packets: [
                {
                    address: '/avatar/parameters/HRF',
                    args: [ { type: 'f', value: bpm / 200.0 } ]
                }
            ]
        });
        last_bpm = bpm;
    }
}

// ANT+ setup

let stick = null;

if (config.ant_version === 3) stick = new ant.GarminStick3();
else if (config.ant_version === 2) stick = new ant.GarminStick2();
else {
    console.error('Invalid stick version in config! Must be either 2 or 3.');
    return;
}

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
    sendBPM(data.ComputedHeartRate);
    hr_pulses += 1;
    if (hr_connected === null) {
        hr_connected = true;
        console.log('HR connected!');
    }
    if (hr_timeout === null) {
        hr_timeout = setTimeout(hr_timeout_cb, TIMEOUT);
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