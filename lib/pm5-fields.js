const pm5printables = {
    ms2hms(msecs) {
        return new Date(msecs).toISOString().slice(11, 19);
    },
    secs2hms(secs) {
        return new Date(secs * 1000).toISOString().slice(11, 21);
    },
    metres:           m => m.toLocaleString() + 'm',
    as_is:            n => n.toString(),
    fixed:            n => n.toFixed(),
    m_per_second:     n => n.toFixed() + 'm/s',
    // Merged sentinel: BLE reports no-belt as 255, HID reports it as 0.
    heartRate:        n => (n === 0 || n === 255) ? 'N/A' : n + ' bpm',
    spm:              n => n + ' spm',
    watts:            n => n.toFixed().toLocaleString() + 'W',
    calories:         n => n.toLocaleString() + 'cals',
    calPerHour:       n => n.toLocaleString() + 'cal/hr',
    metres_fixed:     n => n.toFixed().toLocaleString() + 'm',
    wattMinutes:      n => n.toLocaleString() + 'Wm',
    splitIntervalType: n => n.toString(),

    workoutType(wtype) {
        return ({
            0:  'Just row, no splits',
            1:  'Just row, splits',
            2:  'Fixed dist, no splits',
            3:  'Fixed dist, splits',
            4:  'Fixed time, no splits',
            5:  'Fixed time, splits',
            6:  'Fixed time, interval',
            7:  'Fixed dist, interval',
            8:  'Variable, interval',
            9:  'Variable, undef rest, interval',
            10: 'Fixed, calorie',
            11: 'Fixed, watt-minutes',
            12: 'Fixed cals, interval',
        })[wtype] ?? 'unknown';
    },

    intervalType(itype) {
        return ({
            0:   'Time',
            1:   'Distance',
            2:   'Rest',
            3:   'Time, rest undefined',
            4:   'Distance, rest undefined',
            5:   'Rest, undefined',
            6:   'Calorie',
            7:   'Calorie, rest undefined',
            8:   'Watt-minute',
            9:   'Watt-minute, rest undefined',
            255: 'None',
        })[itype] ?? 'unknown';
    },

    workoutState(wstate) {
        return ({
            0:  'Wait To Begin',
            1:  'Workout Row',
            2:  'Countdown Pause',
            3:  'Interval Rest',
            4:  'Interval Work Time',
            5:  'Interval Work Distance',
            6:  'Interval Rest End To Work Time',
            7:  'Interval Rest End To Work Distance',
            8:  'Interval Work Time To Rest',
            9:  'Interval Work Distance To Rest',
            10: 'Workout End',
            11: 'Terminate',
            12: 'Workout Logged',
            13: 'Rearm',
        })[wstate] ?? 'unknown';
    },

    rowingState: rstate => ({ 0: 'Inactive', 1: 'Active' })[rstate] ?? 'unknown',

    strokeState(sstate) {
        return ({
            0: 'Waiting To Reach Min Speed',
            1: 'Waiting To Accelerate',
            2: 'Driving',
            3: 'Dwelling After Drive',
            4: 'Recovery',
        })[sstate] ?? 'unknown';
    },

    workoutDuration: n => n.toString(),

    // HID (CSAFE) transport formatters.
    workTime(secs) {
        return new Date(secs * 1000).toISOString().slice(11, 19);
    },

    // The CSAFE spec defines every pace command as seconds/500m,
    // unconditionally for every machine type ("Pace <-> /500m Pace" in the
    // Pace Conversions appendix has no machine-type branch) -- that's the
    // raw value BLE/HID both actually send, bike included. But Concept2's
    // own BikeErg convention displays pace per 1000m, not 500m (a bike
    // covers 500m too fast for that unit to be meaningful), so on Bike this
    // doubles the same raw value and relabels it rather than asking
    // hardware for a number it doesn't have. `ergMachineType` is only known
    // on BLE, and only for events that carry it alongside pace (BLE's
    // additional-status bundles both in one payload) -- omit it (HID, or a
    // BLE event without it) and this falls back to today's /500m behavior.
    pace(secs, ergMachineType) {
        if (secs <= 0) return '--:--';
        const isBike = [192, 193, 194, 207].includes(ergMachineType); // see ergMachineType below
        const t = isBike ? secs * 2 : secs;
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60);
        return `${m}:${String(s).padStart(2, '0')}/${isBike ? '1000m' : '500m'}`;
    },

    deviceStatus(n) {
        return ({
            0: 'Error',
            1: 'Ready',
            2: 'Idle',
            3: 'Have ID',
            5: 'In Use',
            6: 'Paused',
            7: 'Finished',
            8: 'Manual',
            9: 'Offline',
        })[n] ?? 'Unknown';
    },

    workoutDurationType(wdurationtype) {
        return ({
            0:    'Time',
            0x40: 'Calories',
            0x80: 'Distance',
            0xc0: 'Watts',
        })[wdurationtype] ?? 'unknown';
    },

    logDate(n) {
        const month = n & 0x0f;
        const day   = (n >> 4) & 0x1f;
        const year  = 2000 + ((n >> 9) & 0x7f);
        return `${day}/${month}/${year}`;
    },

    logTime(n) {
        const h = (n >> 8) & 0xff;
        const m = n & 0xff;
        return `${h}:${m}`;
    },

    gameId(n) {
        const name = ({
            0: 'None',
            1: 'Fish',
            2: 'Dart',
            3: 'Target basic',
            4: 'Target advanced',
            5: 'Cross Training',
        })[n & 0x0f] ?? 'Unknown';
        const verified = (n >> 4) & 0x0f;
        return `${name} (${verified ? '' : 'un'}verified)`;
    },

    ergMachineType(n) {
        return ({
            0:   'Static D',
            1:   'Static C',
            2:   'Static A',
            3:   'Static B',
            5:   'Static E',
            7:   'Static Simulator',
            8:   'Static Dynamic',
            16:  'Slides A',
            17:  'Slides B',
            18:  'Slides C',
            19:  'Slides D',
            20:  'Slides E',
            32:  'Slides Dynamic',
            64:  'Static Dyno',
            128: 'Static Ski',
            143: 'Static Ski (simulator)',
            192: 'Bike',
            193: 'Bike (arms)',
            194: 'Bike (no arms)',
            207: 'Bike (simulator)',
            208: 'Num',
        })[n] ?? '';
    },
};

const pm5fields = {
    elapsedTime: {
        label: 'Elapsed Time',
        printable: pm5printables.secs2hms,
    },
    distance: {
        label: 'Distance',
        printable: pm5printables.metres,
    },
    workoutType: {
        label: 'Workout Type',
        printable: pm5printables.workoutType,
    },
    intervalType: {
        label: 'Interval Type',
        printable: pm5printables.intervalType,
    },
    workoutState: {
        label: 'Workout State',
        printable: pm5printables.workoutState,
    },
    rowingState: {
        label: 'Rowing State',
        printable: pm5printables.rowingState,
    },
    strokeState: {
        label: 'Stroke State',
        printable: pm5printables.strokeState,
    },
    totalWorkDistance: {
        label: 'Total Work Distance',
        printable: pm5printables.metres,
    },
    workoutDuration: {
        label: 'Workout Duration',
        printable: pm5printables.workoutDuration,
    },
    workoutDurationType: {
        label: 'Workout Duration Type',
        printable: pm5printables.workoutDurationType,
    },
    dragFactor: {
        label: 'Drag Factor',
        printable: pm5printables.as_is,
    },
    speed: {
        label: 'Speed',
        printable: pm5printables.m_per_second,
    },
    strokeRate: {
        label: 'Stroke Rate',
        printable: pm5printables.as_is,
    },
    heartRate: {
        label: 'Heart Rate',
        printable: pm5printables.heartRate,
    },
    currentPace: {
        label: 'Current Pace',
        printable: pm5printables.pace,
    },
    averagePace: {
        label: 'Average Pace',
        printable: pm5printables.pace,
    },
    restDistance: {
        label: 'Rest Distance',
        printable: pm5printables.metres,
    },
    restTime: {
        label: 'Rest Time',
        printable: pm5printables.secs2hms,
    },
    ergMachineType: {
        label: 'Erg Machine Type',
        printable: pm5printables.ergMachineType,
    },
    intervalCount: {
        label: 'Interval Count',
        printable: pm5printables.as_is,
    },
    averagePower: {
        label: 'Average Power',
        printable: pm5printables.watts,
    },
    totalCalories: {
        label: 'Total Calories',
        printable: pm5printables.calories,
    },
    splitAveragePace: {
        label: 'Split Average Pace',
        printable: pm5printables.pace,
    },
    splitAveragePower: {
        label: 'Split Average Power',
        printable: pm5printables.watts,
    },
    splitAverageCalories: {
        label: 'Split Average Calories',
        printable: pm5printables.calories,
    },
    lastSplitTime: {
        label: 'Last Split Time',
        printable: pm5printables.secs2hms,
    },
    lastSplitDistance: {
        label: 'Last Split Distance',
        printable: pm5printables.metres,
    },
    driveLength: {
        label: 'Drive Length',
        printable: pm5printables.metres_fixed,
    },
    driveTime: {
        label: 'Drive Time',
        printable: pm5printables.secs2hms,
    },
    strokeRecoveryTime: {
        label: 'Stroke Recovery Time',
        printable: pm5printables.secs2hms,
    },
    strokeDistance: {
        label: 'Stroke Distance',
        printable: pm5printables.metres_fixed,
    },
    peakDriveForce: {
        label: 'Peak Drive Force',
        printable: pm5printables.watts,
    },
    averageDriveForce: {
        label: 'Average Drive Force',
        printable: pm5printables.fixed,
    },
    workPerStroke: {
        label: 'Work Per Stroke',
        printable: pm5printables.fixed,
    },
    strokeCount: {
        label: 'Stroke Count',
        printable: pm5printables.as_is,
    },
    strokePower: {
        label: 'Stroke Power',
        printable: pm5printables.watts,
    },
    strokeCaloricBurnRate: {
        label: 'Stroke Caloric Burn Rate',
        printable: pm5printables.calPerHour,
    },
    projectedWorkTime: {
        label: 'Projected Work Time',
        printable: pm5printables.secs2hms,
    },
    projectedWorkDistance: {
        label: 'Projected Work Distance',
        printable: pm5printables.metres,
    },
    projectedWorkOther: {
        label: 'Projected Work Other',
        printable: pm5printables.as_is,
    },
    splitIntervalTime: {
        label: 'Split Interval Time',
        printable: pm5printables.secs2hms,
    },
    splitIntervalDistance: {
        label: 'Split Interval Distance',
        printable: pm5printables.metres,
    },
    intervalRestTime: {
        label: 'Interval Rest Time',
        printable: pm5printables.secs2hms,
    },
    intervalRestDistance: {
        label: 'Interval Rest Distance',
        printable: pm5printables.metres,
    },
    splitIntervalType: {
        label: 'Split Interval Type',
        printable: pm5printables.splitIntervalType,
    },
    splitIntervalNumber: {
        label: 'Split Interval Number',
        printable: pm5printables.as_is,
    },
    splitIntervalAverageStrokeRate: {
        label: 'Split Interval Average Stroke Rate',
        printable: pm5printables.as_is,
    },
    splitIntervalWorkHeartrate: {
        label: 'Split Interval Work Heart Rate',
        printable: pm5printables.as_is,
    },
    splitIntervalRestHeartRate: {
        label: 'Split Interval Rest Heart Rate',
        printable: pm5printables.as_is,
    },
    splitIntervalAveragePace: {
        label: 'Split Interval Average Pace',
        printable: pm5printables.pace,
    },
    splitIntervalTotalCalories: {
        label: 'Split Interval Total Calories',
        printable: pm5printables.calories,
    },
    splitIntervalAverageCalories: {
        label: 'Split Interval Average Calories',
        printable: pm5printables.calories,
    },
    splitIntervalSpeed: {
        label: 'Split Interval Speed',
        printable: pm5printables.secs2hms,
    },
    splitIntervalPower: {
        label: 'Split Interval Power',
        printable: pm5printables.watts,
    },
    splitAverageDragFactor: {
        label: 'Split Average Drag Factor',
        printable: pm5printables.as_is,
    },
    logEntryDate: {
        label: 'Log Entry Date',
        printable: pm5printables.logDate,
    },
    logEntryTime: {
        label: 'Log Entry Time',
        printable: pm5printables.logTime,
    },
    timeElapsed: {
        label: 'Time Elapsed',
        printable: pm5printables.secs2hms,
    },
    avgStrokeRate: {
        label: 'Average Stroke Rate',
        printable: pm5printables.as_is,
    },
    endingHeartRate: {
        label: 'Ending Heart Rate',
        printable: pm5printables.as_is,
    },
    averageHeartRate: {
        label: 'Average Heart Rate',
        printable: pm5printables.as_is,
    },
    minHeartRate: {
        label: 'Min Heart Rate',
        printable: pm5printables.as_is,
    },
    maxHeartRate: {
        label: 'Max Heart Rate',
        printable: pm5printables.as_is,
    },
    dragFactorAverage: {
        label: 'Drag Factor Average',
        printable: pm5printables.as_is,
    },
    recoveryHeartRate: {
        label: 'Recovery Heart Rate',
        printable: pm5printables.as_is,
    },
    splitIntervalSize: {
        label: 'Split/Interval Size',
        printable: pm5printables.as_is,
    },
    splitIntervalCount: {
        label: 'Split/Interval Count',
        printable: pm5printables.as_is,
    },
    watts: {
        label: 'Watts',
        printable: pm5printables.watts,
    },
    totalRestDistance: {
        label: 'Total Rest Distance',
        printable: pm5printables.metres,
    },
    averageCalories: {
        label: 'Average Calories',
        printable: pm5printables.calories,
    },
    gameIdentifierWorkoutVerified: {
        label: 'Game Identifier / Workout Verified',
        printable: pm5printables.gameId,
    },
    gameScore: {
        label: 'Game Score',
        printable: pm5printables.as_is,
    },
    totalWattMinutes: {
        label: 'Total Watt-Minutes',
        printable: pm5printables.wattMinutes,
    },

    // HID (CSAFE) transport fields. Keys are distinct from the BLE keys
    // above; the shared keys (workoutType, workoutState, strokeState,
    // dragFactor, heartRate) reuse the BLE entries already defined.
    status: {
        label: 'Device Status',
        printable: pm5printables.deviceStatus,
    },
    workTime: {
        label: 'Work Time',
        printable: pm5printables.workTime,
    },
    workDistance: {
        label: 'Work Distance',
        printable: pm5printables.metres,
    },
    pace: {
        label: 'Pace',
        printable: pm5printables.pace,
    },
    power: {
        label: 'Power',
        printable: pm5printables.watts,
    },
    calories: {
        label: 'Calories',
        printable: pm5printables.calories,
    },
    cadence: {
        label: 'Stroke Rate',
        printable: pm5printables.spm,
    },
};

// ponytail: export shim so test/printables.test.mjs can import the pure
// formatter/field maps under node; a no-op in the browser (no `module`).
if (typeof module !== 'undefined') {
    module.exports = { pm5printables, pm5fields };
}
