const pm5printables = {
    empty: function(v) {
        return v.toString();
    },
    ms2hms: function(msecs) {
        return new Date(msecs).toISOString().substr(11, 8);
    },
    secs2hms: function(secs) {
        return new Date(secs * 1000).toISOString().substr(11, 10);
    },
    metres: function(m) {
        return m.toLocaleString() + 'm';
    },
    workoutType: function(wtype) {
        switch (wtype) {
            case 0: return 'Just row, no splits'; break;
            case 1: return 'Just row, splits'; break;
            case 2: return 'Fixed dist, no splits'; break;
            case 3: return 'Fixed dist, splits'; break;
            case 4: return 'Fixed time, no splits'; break;
            case 5: return 'Fixed time, splits'; break;
            case 6: return 'Fixed time, interval'; break;
            case 7: return 'Fixed dist, interval'; break;
            case 8: return 'Variable, interval'; break;
            case 9: return 'Variable, undef rest, interval'; break;
            case 10: return 'Fixed, calorie'; break;
            case 11: return 'Fixed, watt-minutes'; break;
            case 12: return 'Fixed cals, interval'; break;
            default:
                break;
        }
        return 'unknown';
    },
    intervalType: function(itype) {
        switch (itype) {
            case 0: return 'Time'; break;
            case 1: return 'Distance'; break;
            case 2: return 'Rest'; break;
            case 3: return 'Time, rest undefined'; break;
            case 4: return 'Distance, rest undefined'; break;
            case 5: return 'Rest, undefined'; break;
            case 6: return 'Calorie'; break;
            case 7: return 'Calorie, rest undefined'; break;
            case 8: return 'Watt-minute'; break;
            case 9: return 'Watt-minute, rest undefined'; break;
            case 255: return 'None';
            default:
                break;
        }
        return 'unknown';
    },
    workoutState: function(wstate) {
        switch (wstate) {
            case 0: return 'Wait To Begin'; break;
            case 1: return 'Workout Row'; break;
            case 2: return 'Countdown Pause'; break;
            case 3: return 'Interval Rest'; break;
            case 4: return 'Interval Work Time'; break;
            case 5: return 'Interval Work Distance'; break;
            case 6: return 'Interval Rest End To Work Time'; break;
            case 7: return 'Interval Rest End To Work Distance'; break;
            case 8: return 'Interval Work Time To Rest'; break;
            case 9: return 'Interval Work Distance To Rest'; break;
            case 10: return 'Workout End'; break;
            case 11: return 'Terminate'; break;
            case 12: return 'Workout Logged'; break;
            case 13: return 'Rearm'; break;
            default:
                break;
        }
        return 'unknown';
    },
    rowingState: function(rstate) {
        switch (rstate) {
            case 0: return 'Inactive'; break;
            case 1: return 'Active'; break;
            default:
                break;
        }
        return 'unknown';
    },
    strokeState: function(sstate) {
        switch (sstate) {
            case 0: return 'Waiting To Reach Min Speed'; break;
            case 1: return 'Waiting To Accelerate'; break;
            case 2: return 'Driving'; break;
            case 3: return 'Dwelling After Drive'; break;
            case 4: return 'Recovery'; break;
            default:
                break;
        }
        return 'unknown';
    },
    workoutDuration: function(wduration) {
        /* XXX Figure out how to handle this one */
        /*
         * enum DurationTypes {
         *      CSAFE_TIME_DURATION = 0,
         *      CSAFE_CALORIES_DURATION = 0x40,
         *      CSAFE_DISTANCE_DURATION = 0x80,
         *      CSAFE_WATTS_DURATION = 0xc0
         * }
         */
        /*
        if (data.workoutDurationType == 0x0) {
            data.workoutDuration *= 0.01;
        }
        */
        return wduration.toString();
    },
    workoutDurationType: function(wdurationtype) {
        switch (wdurationtype) {
            case 0: return 'Time'; break;
            case 0x40: return 'Calories'; break;
            case 0x80: return 'Distance'; break;
            case 0xc0: return 'Watts'; break;
            default:
                break;
        }
        return 'unknown';
    },
    as_is: function(n) {
        return n.toString();
    },
    fixed: function(n) {
        return n.toFixed();
    },
    m_per_second: function(n) {
        return n.toFixed() + "m/s";
    },
    heartRate: function(n) {
        return n == 255 ? 'N/A' : n;
    },
    watts: function(n) {
        return n.toFixed().toLocaleString() + 'W';
    },
    calories: function(n) {
        return n.toLocaleString() + 'cals';
    },
    metres_fixed: function(n) {
        return n.toFixed().toLocaleString() + 'm';
    },
    splitIntervalType: function(n) {
        return n.toString();
    },
    logDate: function(n) {
        let month = n & 0x0f;                   /* bits 0 to 3 */
        let day = (n >> 4) & 0x1f;              /* bits 4 to 8 */
        let year = 2000 + ((n >> 9) & 0x7f);    /* bits 9 to 13 (15); epoch is 2000 */

        return day + "/" + month + "/" + year;
    },
    logTime: function(n) {
        let h = (n >> 8) & 0xff;                /* top byte */
        let m = n & 0xff;                       /* bottom byte */

        return h + ":" + m;
    },
    gameId: function(n) {
        let game_id = n & 0x0f;
        let workout_verified = (n >> 4) & 0x0f; /* JavaScript uses >>> for zero-fill right shift! */
        let r = '';

        switch (game_id) {
            case 0: r = 'None '; break;
            case 1: r = 'Fish '; break;
            case 2: r = 'Dart '; break;
            case 3: r = 'Target basic '; break;
            case 4: r = 'Target advanced '; break;
            case 5: r = 'Cross Training '; break;
            default:
                break;
        }

        r += '(' + (!workout_verified ? 'un' : '') + 'verified)';

        return r;
    },
    erg_machine_type: function(n) {
        r = '';

        switch (n) {
            case 0: r = 'Static D'; break;
            case 1: r = 'Static C'; break;
            case 2: r = 'Static A'; break;
            case 3: r = 'Static B'; break;
            case 5: r = 'Static E'; break;
            case 7: r = 'Static Simulator'; break;
            case 8: r = 'Static Dynamic'; break;
            case 16: r = 'Slides A'; break;
            case 17: r = 'Slides B'; break;
            case 18: r = 'Slides C'; break;
            case 19: r = 'Slides D'; break;
            case 20: r = 'Slides E'; break;
            case 32: r = 'Slides Dynamic'; break;
            case 64: r = 'Static Dyno'; break;
            case 128: r = 'Static Ski'; break;
            case 143: r = 'Static Ski (simulator)'; break;
            case 192: r = 'Bike'; break;
            case 193: r = 'Bike (arms)'; break;
            case 194: r = 'Bike (no arms)'; break;
            case 207: r = 'Bike (simulator)'; break;
            case 208: r = 'Num'; break;
            default:
                break;
        }

        return r;
    }
};

const pm5fields = {
    elapsedTime: {
        label: 'Elapsed Time',
        printable: pm5printables['secs2hms']
    },
    distance: {
        label: 'Distance',
        printable: pm5printables['metres'],
    },
    workoutType: {
        label: 'Workout Type',
        printable: pm5printables['workoutType'],
    },
    intervalType: {
        label: 'Interval Type',
        printable: pm5printables['intervalType'],
    },
    workoutState: {
        label: 'Workout State',
        printable: pm5printables['workoutState'],
    },
    rowingState: {
        label: 'Rowing State',
        printable: pm5printables['rowingState'],
    },
    strokeState: {
        label: 'Stroke State',
        printable: pm5printables['strokeState'],
    },
    totalWorkDistance: {
        label: 'Total Work Distance',
        printable: pm5printables['metres'],
    },
    workoutDuration: {
        label: 'Workout Duration',
        printable: pm5printables['workoutDuration'],
    },
    workoutDurationType: {
        label: 'Workout Duration Type',
        printable: pm5printables['workoutDurationType'],
    },
    dragFactor: {
        label: 'Drag Factor',
        printable: pm5printables['as_is'],
    },
    speed: {
        label: 'Speed',
        printable: pm5printables['m_per_second'],
    },
    strokeRate: {
        label: 'Stroke Rate',
        printable: pm5printables['as_is'],
    },
    heartRate: {
        label: 'Heart Rate',
        printable: pm5printables['heartRate'],
    },
    currentPace: {
        label: 'Current Pace',
        printable: pm5printables['secs2hms'],
    },
    averagePace: {
        label: 'Average Pace',
        printable: pm5printables['secs2hms'],
    },
    restDistance: {
        label: 'Rest Distance',
        printable: pm5printables['metres'],
    },
    restTime: {
        label: 'Rest Time',
        printable: pm5printables['secs2hms'],
    },
    intervalCount: {
        label: 'Interval Count',
        printable: pm5printables['as_is'],
    },
    averagePower: {
        label: 'Average Power',
        printable: pm5printables['watts'],
    },
    totalCalories: {
        label: 'Total Calories',
        printable: pm5printables['calories'],
    },
    splitAveragePace: {
        label: 'Split Average Pace',
        printable: pm5printables['secs2hms'],
    },
    splitAveragePower: {
        label: 'Split Average Power',
        printable: pm5printables['watts'],
    },
    splitAverageCalories: {
        label: 'Split Average Calories',
        printable: pm5printables['calories'],
    },
    lastSplitTime: {
        label: 'Last Split Time',
        printable: pm5printables['secs2hms'],
    },
    lastSplitDistance: {
        label: 'Last Split Distance',
        printable: pm5printables['metres'],
    },
    driveLength: {
        label: 'Drive Length',
        printable: pm5printables['metres_fixed'],
    },
    driveTime: {
        label: 'Drive Time',
        printable: pm5printables['secs2hms'],
    },
    strokeRecoveryTime: {
        label: 'Stroke Recovery Time',
        printable: pm5printables['secs2hms'],
    },
    strokeDistance: {
        label: 'Stroke Distance',
        printable: pm5printables['metres_fixed'],
    },
    peakDriveForce: {
        label: 'Peak Drive Force',
        printable: pm5printables['watts'],
    },
    averageDriveForce: {
        label: 'Average Drive Force',
        printable: pm5printables['fixed'],
    },
    workPerStroke: {
        label: 'Work Per Stroke',
        printable: pm5printables['fixed'],
    },
    strokeCount: {
        label: 'Stroke Count',
        printable: pm5printables['as_is'],
    },
    strokePower: {
        label: 'Stroke Power',
        printable: pm5printables['watts'],
    },
    strokeCalories: {
        label: 'Stroke Calories',
        printable: pm5printables['calories'],
    },
    strokeCount: {
        label: 'Stroke Count',
        printable: pm5printables['as_is'],
    },
    projectedWorkTime: {
        label: 'Projected Work Time',
        printable: pm5printables['secs2hms'],
    },
    projectedWorkDistance: {
        label: 'Projected Work Distance',
        printable: pm5printables['metres'],
    },
    workPerStroke: {
        label: 'Work Per Stroke',
        printable: pm5printables['watts'],
    },
    splitIntervalTime: {
        label: 'Split Interval Time',
        printable: pm5printables['secs2hms'],
    },
    splitIntervalDistance: {
        label: 'Split Interval Distance',
        printable: pm5printables['metres'],
    },
    intervalRestTime: {
        label: 'Interval Rest Time',
        printable: pm5printables['secs2hms'],
    },
    intervalRestDistance: {
        label: 'Interval Rest Distance',
        printable: pm5printables['metres'],
    },
    splitIntervalType: {
        label: 'Split Interval Type',
        printable: pm5printables['splitIntervalType'],
    },
    splitIntervalNumber: {
        label: 'Split Interval Number',
        printable: pm5printables['as_is'],
    },
    splitIntervalAverageStrokeRate: {
        label: 'Split Interval Average Stroke Rate',
        printable: pm5printables['as_is'],
    },
    splitIntervalWorkHeartrate: {
        label: 'Split Interval Work Heart Rate',
        printable: pm5printables['as_is'],
    },
    splitIntervalRestHeartRate: {
        label: 'Split Interval Rest Heart Rate',
        printable: pm5printables['as_is'],
    },
    splitIntervalAveragePace: {
        label: 'Split Interval Average Pace',
        printable: pm5printables['secs2hms'],
    },
    splitIntervalTotalCalories: {
        label: 'Split Interval Total Calories',
        printable: pm5printables['calories'],
    },
    splitIntervalAverageCalories: {
        label: 'Split Interval Average Calories',
        printable: pm5printables['calories'],
    },
    splitIntervalSpeed: {
        label: 'Split Interval Speed',
        printable: pm5printables['secs2hms'],
    },
    splitIntervalPower: {
        label: 'Split Interval Power',
        printable: pm5printables['watts'],
    },
    splitAverageDragFactor: {
        label: 'Split Average Drag Factor',
        printable: pm5printables['as_is'],
    },
    splitIntervalNumber: {
        label: 'Split Interval Number',
        printable: pm5printables['as_is'],
    },
    logEntryDate: {
        label: 'Log Entry Date',
        printable: pm5printables['logDate'],
    },
    logEntryTime: {
        label: 'Log Entry Time',
        printable: pm5printables['logTime'],
    },
    timeElapsed: {
        label: 'Time Elapsed',
        printable: pm5printables['secs2hms'],
    },
    avgStrokeRate: {
        label: 'Average Stroke Rate',
        printable: pm5printables['as_is'],
    },
    endingHeartRate: {
        label: 'Ending Heart Rate',
        printable: pm5printables['as_is'],
    },
    averageHeartRate: {
        label: 'Average Heart Rate',
        printable: pm5printables['as_is'],
    },
    minHeartRate: {
        label: 'Min Heart Rate',
        printable: pm5printables['as_is'],
    },
    maxHeartRate: {
        label: 'Max Heart Rate',
        printable: pm5printables['as_is'],
    },
    dragFactorAverage: {
        label: 'Drag Factor Average',
        printable: pm5printables['as_is'],
    },
    recoveryHeartRate: {
        label: 'Recovery Heart Rate',
        printable: pm5printables['as_is'],
    },
    splitIntervalSize: {
        label: 'Split/Interval Type',
        printable: pm5printables['as_is'],
    },
    splitIntervalCount: {
        label: 'Split/Interval Count',
        printable: pm5printables['as_is'],
    },
    watts: {
        label: 'Watts',
        printable: pm5printables['watts']
    },
    totalRestDistance: {
        label: 'Total Rest Distance',
        printable: pm5printables['metres']
    },
    averageCalories: {
        label: 'Average Calories',
        printable: pm5printables['calories']
    },
    gameIdentifierWorkoutVerified: {
        label: 'Game Identifer / Workout Verified',
        printable: pm5printables['gameId']
    },
    gameScore: {
        label: 'Game score',
        printable: pm5printables['as_is']
    },
    ergMachineType: {
        label: 'Erg Machine Type',
        printable: pm5printables['erg_machine_type']
    }
};
