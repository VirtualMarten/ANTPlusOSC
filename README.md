# ANT+ OSC
 OSC output from ANT+ devices. Used for getting Heart Rate into VRChat.

Currently only Heart Rate (BPM) is supported.

## Configuration

### `output_port`

The port that the OSC messages will get sent to. VRChat's default listening port is 9000.

### `ant_version`

The version of ANT protocol to use. Can be version 2 or 3.

### `timeout`

The maximum amount of time (in milliseconds) that the application will wait for a response from a connected device.

### `reconnect_delay`

The amount of time (in milliseconds) that the application will wait before attempting to reconnect to a device that has disconnected.

### `outputs`

A list of output objects that define the data to be sent to connected devices.

- `type` is the source (only bpm for now) followed by a colon and then the data type.
 Supported types are "float" or "f", "int" or "i", and "digits".
 Example: "bpm:int" means source BPM, output data type int.
- `path` is the OSC path the value will be sent on.
- `normalization_range` is only used if the output data type is "float". Format: "min-max"
 When specified it will normalize the value between the given min and max.
 Example: "0-300" will with a bpm of 88 will output 0.293
 
#### Digits output data type

Digits outputs each digit of the source value.

- `digits_max` sets the maximum of the source value. Usefull for making sure you don't end up with too many digits.
- `digit_subpaths` determines if the output value is sent over multiple subpaths "bpm/digits/1" or as a suffix "bpm/digits_1".
