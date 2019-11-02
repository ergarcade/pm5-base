'use strict';

/*
 * Minimal usage:
 *
 *  function cb_connecting() {
 *       // stuff to do while browser is connecting to PM5
 *  }
 *
 *  function cb_connected() {
 *       // do this when browser connects to PM5
 *  }
 *
 *  function cb_disconnected() {
 *      // stuff to do when disconnected from PM5
 *  }
 *
 *  function cb_message(m) {
 *      // message received here.
 *  }
 *
 *  m = new PM5(cb_connecting, cb_connected, cb_disconnected, cb_message);
 *
 *  // Chrome connections to Bluetooth devices can only occur
 *  // on user gesture (https://webbluetoothcg.github.io/web-bluetooth/#ua-bluetooth-address).
 *  document.querySelector('#connect').addEventListener('click', function() {
 *      if (m.connected()) {
 *          m.doDisconnect();
 *      } else {
 *          m.doConnect();
 *      }
 *  });
 */

/*
 * From https://developer.mozilla.org/en-US/docs/Web/API/EventTarget
 */
var EventTarget = function() {
    this.listeners = {};
};

EventTarget.prototype.listeners = null;
EventTarget.prototype.addEventListener = function(type, callback) {
    if (!(type in this.listeners)) {
        this.listeners[type] = [];
    }
    this.listeners[type].push(callback);
};

EventTarget.prototype.removeEventListener = function(type, callback) {
    if (!(type in this.listeners)) {
        return;
    }
    var stack = this.listeners[type];
    for (var i = 0, l = stack.length; i < l; i++) {
        if (stack[i] === callback){
            stack.splice(i, 1);
            return;
        }
    }
};

EventTarget.prototype.dispatchEvent = function(event) {
    if (!(event.type in this.listeners)) {
        return true;
    }
    var stack = this.listeners[event.type].slice();

    for (var i = 0, l = stack.length; i < l; i++) {
        stack[i].call(this, event);
    }
    return !event.defaultPrevented;
};

/*
 * From the Concept2 Performance Monitor Bluetooth Smart Communications
 * Interface Definition spec, v1.25, 8/29/17 11:19AM.
 *
 * Verify discovered services:
 * - https://googlechrome.github.io/samples/web-bluetooth/discover-services-and-characteristics.html
 *
 * Inspired from https://github.com/GoogleChromeLabs/rowing-monitor
 */
const services = {
    discovery:      { id: 'ce060000-43e5-11e4-916c-0800200c9a66' },
    information:    { id: 'ce060010-43e5-11e4-916c-0800200c9a66' },
    control:        { id: 'ce060020-43e5-11e4-916c-0800200c9a66' },
    rowing:         { id: 'ce060030-43e5-11e4-916c-0800200c9a66' }
};
const characteristics = {
    informationService: {
        serialNumber: {
            id:         'ce060012-43e5-11e4-916c-0800200c9a66',
            service:    services.information
        },
        hardwareRevision: {
            id:         'ce060013-43e5-11e4-916c-0800200c9a66',
            service:    services.information
        },
        firmwareRevision: {
            id:         'ce060014-43e5-11e4-916c-0800200c9a66',
            service:    services.information
        },
        manufacturerName: {
            id:         'ce060015-43e5-11e4-916c-0800200c9a66',
            service:    services.information
        }
    },
    controlService: {
        transmit: {
            id:         'ce060021-43e5-11e4-916c-0800200c9a66',
            service:    services.control
        },
        receive: {
            id:         'ce060022-43e5-11e4-916c-0800200c9a66',
            service:    services.control
        }
    },
    rowingService: {
        generalStatus: {
            id:         'ce060031-43e5-11e4-916c-0800200c9a66',
            service:    services.rowing
        },
        additionalStatus: {
            id:         'ce060032-43e5-11e4-916c-0800200c9a66',
            service:    services.rowing
        },
        additionalStatus2: {
            id:         'ce060033-43e5-11e4-916c-0800200c9a66',
            service:    services.rowing
        },
        generalStatusRate: {
            id:         'ce060034-43e5-11e4-916c-0800200c9a66',
            service:    services.rowing
        },
        strokeData: {
            id:         'ce060035-43e5-11e4-916c-0800200c9a66',
            service:    services.rowing
        },
        additionalStrokeData: {
            id:         'ce060036-43e5-11e4-916c-0800200c9a66',
            service:    services.rowing
        },
        splitIntervalData: {
            id:         'ce060037-43e5-11e4-916c-0800200c9a66',
            service:    services.rowing
        },
        additionalSplitIntervalData: {
            id:         'ce060038-43e5-11e4-916c-0800200c9a66',
            service:    services.rowing
        },
        endOfWorkoutSummaryData: {
            id:         'ce060039-43e5-11e4-916c-0800200c9a66',
            service:    services.rowing
        },
        additionalEndOfWorkoutSummaryData: {
            id:         'ce06003a-43e5-11e4-916c-0800200c9a66',
            service:    services.rowing
        },
        heartRateBeltInformation: {
            id:         'ce06003b-43e5-11e4-916c-0800200c9a66',
            service:    services.rowing
        },
        additionalEndOfWorkoutSummaryData2: {
            id:         'ce06003c-43e5-11e4-916c-0800200c9a66', /* multiplexed only */
            service:    services.rowing
        },
        forceCurveData: {
            id:         'ce06003d-43e5-11e4-916c-0800200c9a66',
            service:    services.rowing
        },
        multiplexedInformation: {
            id:         'ce060080-43e5-11e4-916c-0800200c9a66',
            service:    services.rowing
        }
    }
};

class PM5 {
    /*
     */
    constructor(cb_connecting, cb_connected, cb_disconnected, cb_message) {
        this.idObjectMap = new Map();
        this.eventTarget = new EventTarget();

        this.cb_connecting = cb_connecting;
        this.cb_connected = cb_connected;
        this.cb_disconnected = cb_disconnected;
        this.cb_message = cb_message;
    }

    /*
     */
    doConnect() {
        this.connect()
        .then(() => {
            this.cb_connecting();
            return this.addEventListener('multiplexed-information', this.cb_message)
        })
        .then(() => {
            return this.addEventListener('disconnect', this.cb_disconnected);
        })
        .then(() => {
            this.cb_connected();
        })
        .catch(error => {
            console.log(error);
        });
    }

    /*
     */
    doDisconnect() {
        this.removeEventListener('multiplexed-information', this.cb_message)
        .then(() => {
            this.disconnect();
            this.removeEventListener('multiplexed-information', this.cb_message)
        })
        .then(() => {
            return this.removeEventListener('disconnect', this.cb_disconnected);
        })
        .catch(error => {
            console.log(error);
        });
    }

    /*
     */
    addEventListener(type, callback) {
        this.eventTarget.addEventListener(type, callback);
        switch (type) {
            case 'general-status':
                return this._addGeneralStatusListener();
                break;

            case 'workout-end':
                return this._addWorkoutEndListener();
                break;

            case 'multiplexed-information':
                return this._addMultiplexedInformationListener();
                break;

            case 'additional-status':
                return this._addAdditionalStatus();
                break;

            case 'additional-status2':
                return this._addAdditionalStatus2();
                break;

            case 'stroke-data':
                return this._addStrokeData();
                break;

            case 'additional-stroke-data':
                return this._addAdditionalStrokeData();
                break;

            case 'split-interval-data':
                return this._addSplitIntervalData();
                break;

            case 'additional-split-interval-data':
                return this._addAdditionalSplitIntervalData();
                break;

            case 'force-curve-data':
                /*
                 * XXX We get this back:
                 *
                 *   NotFoundError: No Characteristics matching UUID
                 *   ce06003d-43e5-11e4-916c-0800200c9a66 found in
                 *   Service with UUID ce060030-43e5-11e4-916c-0800200c9a66.
                 *
                 * It _looks_ like this characteristic doesn't appear
                 * in this service as per the spec. Have to get in touch
                 * with Concept2 to see if this is the case, and what
                 * service we need to associate this characteristic with.
                 */
                // return this._addForceCurveData();
                break;

            case 'additional-workout-end':
                return this._addAdditionalEndOfWorkoutSummaryData();
                break;

            case 'heart-rate-belt-information':
                return this._addHeartRateBeltInformation();
                break;

            case 'additional-workout-end2':
                return this._addAdditionalEndOfWorkoutSummaryData2();
                break;

            default:
                break;
        }
    }

    /*
     */
    removeEventListener(type, callback) {
        this.eventTarget.removeEventListener(type, callback);

        /*
         * We can only modify characteristics if we are connected.
         */
        if (!this.connected()) {
            return Promise.resolve();
        }

        switch (type) {
            case 'general-status':
                return this._removeGeneralStatusListener();
                break;

            case 'workout-end':
                return this._removeWorkoutEndListener();
                break;

            case 'multiplexed-information':
                return this._removeMultiplexedInformationListener();
                break;

            case 'additional-status':
                return this._removeAdditionalStatus();
                break;

            case 'additional-status2':
                return this._removeAdditionalStatus2();
                break;

            case 'stroke-data':
                return this._removeStrokeData();
                break;

            case 'additional-stroke-data':
                return this._removeAdditionalStrokeData();
                break;

            case 'split-interval-data':
                return this._removeSplitIntervalData();
                break;

            case 'additional-split-interval-data':
                return this._removeAdditionalSplitIntervalData();
                break;

            case 'force-curve-data':
                return this._removeForceCurveData();
                break;

            case 'additional-workout-end':
                return this._removeAdditionalEndOfWorkoutSummaryData();
                break;

            case 'heart-rate-belt-information':
                return this._removeHeartRateBeltInformation();
                break;

            case 'additional-workout-end2':
                return this._removeAdditionalEndOfWorkoutSummaryData2();
                break;

            default:
                break;
        }
    }

    /*
     */
    connect() {
        if (!navigator.bluetooth) {
            return Promise.reject('Bluetooth not available');
        }

        return navigator.bluetooth.requestDevice({
            filters: [{
                services: [
                    services.discovery.id
                ]
            }],
            optionalServices: [
                services.information.id,
                services.control.id,
                services.rowing.id
            ]
        })
        .then(device => {
            this.device = device;
            this.device.addEventListener('gattserverdisconnected', _gattDisconnect => {
                console.log('gattserverdisconnected');
                this.device.removeEventListener('gattserverdisconnected', _gattDisconnect);
                this.idObjectMap.clear();
                this.eventTarget.dispatchEvent({ type: 'disconnect'});
            });
            return device.gatt.connect();
        })
        .then(server => {
            this.server = server;
            return Promise.resolve();
        })
        .catch(error => {
            console.log(error);
            return Promise.reject(error);
        });
    }

    /*
     */
    disconnect() {
        if (!this.connected()) {
            console.log("disconnect: wasn't connected");
            return;
        }
        this.device.gatt.disconnect();
    }

    /*
     */
    connected() {
        return this.device && this.device.gatt && this.device.gatt.connected;
    }

    /*
     */
    _getService(service) {
        const serviceObject = this.idObjectMap.get(service.id);

        if (serviceObject) {
            return Promise.resolve(serviceObject);
        }

        return this.server.getPrimaryService(service.id)
            .then(s => {
                this.idObjectMap.set(service.id, s);
                return Promise.resolve(s);
            })
            .catch(error => {
                console.log('getPrimaryService(' + service.id + ')');
                return Promise.reject(error);
            });
    }

    /*
     * 0x003d is not multiplexed.
     */
    _cbForceCurveData(monitor, e) {
        const v = new Uint8Array(e.target.value.buffer);
        const numCharacteristics = (v[0] >> 4) & 0x0f;
        const numDataPoints = v[0] & 0x0f;
        const sequenceNumber = v[1];
        let data = [];

        for (let i = 2; i <= numDataPoints*2; i += 2) {
            data.push(v[i] + (v[i+1] << 8));
        }

        const event = {
            type: 'force-curve-data',
            source: monitor,
            raw: e.target.value,
            data: {
                numCharacteristics: numCharacteristics,
                numDataPoints: numDataPoints,
                sequeneNumber: sequenceNumber,
                data: data
            }
        };

        monitor.eventTarget.dispatchEvent(event);
    }

    /*
     * CSAFE equivalent commands:
     *
     * elapsedTime          = N/A
     * distance             = N/A
     * workoutType          = CSAFE_PM_GET_WORKOUTTYPE
     * intervalType         = CSAFE_PM_GET_INTERVALTYPE
     * workoutState         = CSAFE_PM_GET_WORKOUTSTATE
     * rowingState          = CSAFE_PM_GET_ROWINGSTATE
     * strokeState          = CSAFE_PM_GET_STROKESTATE
     * totalWorkDistance    = CSAFE_PM_GET_WORKDISTANCE
     * workoutDuration      = CSAFE_PM_GET_WORKOUTDURATION
     * workoutDurationType  = CSAFE_PM_GET_WORKOUTDURATION
     * dragFactor           = CSAFE_PM_GET_DRAGFACTOR
     */
    _extractGeneralStatus(e, multiplexed = false) {
        const o = multiplexed ? 1 : 0;
        const v = new Uint8Array(e.target.value.buffer);

        let data = {
            elapsedTime:        (v[o+0] + (v[o+1] << 8) + (v[o+2] << 16)) * 0.01,
            distance:           (v[o+3] + (v[o+4] << 8) + (v[o+5] << 16)) * 0.1,
            workoutType:        v[o+6],
            intervalType:       v[o+7],
            workoutState:       v[o+8],
            rowingState:        v[o+9],
            strokeState:        v[o+10],
            totalWorkDistance:  (v[o+11] + (v[o+12] << 8) + (v[o+13] << 16)),
            workoutDuration:    (v[o+14] + (v[o+15] << 8) + (v[o+16] << 16)),
            workoutDurationType:v[o+17],
            dragFactor:         v[o+18]
        };

        /*
         * C2 BT CID: page 11, 0x0031 characteristic
         * "Workout Duration Lo (if time, 0.01 sec lsb)"
         *
         * enum DurationTypes {
         *      CSAFE_TIME_DURATION = 0,
         *      CSAFE_CALORIES_DURATION = 0x40,
         *      CSAFE_DISTANCE_DURATION = 0x80,
         *      CSAFE_WATTS_DURATION = 0xc0
         * }
         */
        if (data.workoutDurationType == 0x0) {
            data.workoutDuration *= 0.01;
        }

        return data;
    }

    /*
     */
    _cbGeneralStatus(monitor, e, multiplexed = false) {
        const event = {
            type: multiplexed ? 'multiplexed-information' : 'general-status',
            source: monitor,
            raw: e.target.value,
            data: monitor._extractGeneralStatus(e, multiplexed)
        };

        monitor.eventTarget.dispatchEvent(event);
    }

    /*
     * CSAFE equivalent commands:
     *
     * elapsedTime      = N/A
     * speed            = CSAFE_GETSPEED
     * strokeRate       = CSAFE_PM_GET_STROKESTATE
     * heartRate        = CSAFE_PM_GET_AVG_HEARTRATE
     * currentPace      = N/A
     * averagePace      = CSAFE_PM_GET_TOTAL_AVG_500MPACE
     * restDistance     = CSAFE_PM_GET_RESTDISTANCE
     * restTime         = CSAFE_PM_GET_RESTTIME
     */
    _extractAdditionalStatus(e, multiplexed = false) {
        const o = multiplexed ? 1 : 0;
        const v = new Uint8Array(e.target.value.buffer);
        const r = {
            elapsedTime:        (v[o+0] + (v[o+1] << 8) + (v[o+2] << 16)) * 0.01,
            speed:              (v[o+3] + (v[o+4] << 8)) * 0.001,
            strokeRate:         v[o+5],
            heartRate:          v[o+6],
            currentPace:        (v[o+7] + (v[o+8] << 8)) * 0.01,
            averagePace:        (v[o+9] + (v[o+10] << 8)) * 0.01,
            restDistance:       (v[o+11] + (v[o+12] << 8)),
            restTime:           (v[o+13] + (v[o+14] << 8) + (v[o+15] << 16)) * 0.01
        };

        if (multiplexed) {
            r.averagePower = v[o+16] + (v[o+17] << 8);
        }

        return r;
    }

    /*
     */
    _cbAdditionalStatus(monitor, e, multiplexed = false) {
        const event = {
            type: multiplexed ? 'multiplexed-information' : 'additional-status',
            source: monitor,
            raw: e.target.value,
            data: monitor._extractAdditionalStatus(e, multiplexed)
        };

        monitor.eventTarget.dispatchEvent(event);
    }

    /*
     * CSAFE equivalent commands:
     *
     * elapsedTime          = N/A
     * intervalCount        = CSAFE_PM_GET_WORKOUTINTERVALCOUNT
     * averagePower         = CSAFE_PM_GET_TOTAL_AVG_POWER
     * totalCalories        = CSAFE_PM_GET_TOTAL_AVG_CALORIES
     * splitAveragePace     = CSAFE_PM_GET_SPLIT_AVG_500MPACE
     * splitAveragePower    = CSAFE_PM_GET_SPLIT_AVG_POWER
     * splitAverageCalories = CSAFE_PM_GET_SPLIT_AVG_CALORIES
     * lastSplitTime        = CSAFE_PM_GET_LAST_SPLITTIME
     * lastSplitDistance    = CSAFE_PM_GET_LAST_SPLITDISTANCE
     */
    _extractAdditionalStatus2(e, multiplexed = false) {
        const o = multiplexed ? 1 : 0;
        const v = new Uint8Array(e.target.value.buffer);
        const r = {};

        if (multiplexed) {
            r.elapsedTime =           (v[o+0] + (v[o+1] << 8) + (v[o+2] << 16)) * 0.01;
            r.intervalCount =         v[o+3];
            r.totalCalories =         (v[o+4] + (v[o+5] << 8));
            r.splitAveragePace =      (v[o+6] + (v[o+7] << 8)) * 0.01;
            r.splitAveragePower =     (v[o+8] + (v[o+9] << 8));
            r.splitAverageCalories =  (v[o+10] + (v[o+11] << 8));
            r.lastSplitTime =         (v[o+12] + (v[o+13] << 8) + (v[o+14] << 16));
            r.lastSplitDistance =     (v[o+15] + (v[o+16] << 8) + (v[o+17] << 16));
        } else {
            r.elapsedTime =           (v[o+0] + (v[o+1] << 8) + (v[o+2] << 16)) * 0.01;
            r.intervalCount =         v[o+3];
            r.averagePower =          (v[o+4] + (v[o+5] << 8));
            r.totalCalories =         (v[o+6] + (v[o+7] << 8));
            r.splitAveragePace =      (v[o+8] + (v[o+9] << 8)) * 0.01;
            r.splitAveragePower =     (v[o+10] + (v[o+11] << 8));
            r.splitAverageCalories =  (v[o+12] + (v[o+13] << 8));
            r.lastSplitTime =         (v[o+14] + (v[o+15] << 8) + (v[o+16] << 16));
            r.lastSplitDistance =     (v[o+17] + (v[o+18] << 8) + (v[o+19] << 16));
        };

        return r;
    }

    /*
     */
    _cbAdditionalStatus2(monitor, e, multiplexed = false) {
        const event = {
            type: multiplexed ? 'multiplexed-information' : 'additional-status2',
            source: monitor,
            raw: e.target.value,
            data: monitor._extractAdditionalStatus2(e, multiplexed)
        };

        monitor.eventTarget.dispatchEvent(event);
    }

    /*
     * CSAFE equivalent commands:
     *
     * elapsedTime          = N/A
     * distance             = N/A
     * driveLength          = CSAFE_PM_GET_STROKESTATS
     * driveTime            = CSAFE_PM_GET_STROKESTATS
     * strokeRecoveryTime   = CSAFE_PM_GET_STROKESTATS
     * strokeDistance       = CSAFE_PM_GET_STROKESTATS
     * peakDriveForce       = CSAFE_PM_GET_STROKESTATS
     * averageDriveForce    = CSAFE_PM_GET_STROKESTATS
     * workPerStroke        = CSAFE_PM_GET_STROKESTATS
     * strokeCount          = CSAFE_PM_GET_STROKESTATS
     */
    _extractStrokeData(e, multiplexed = false) {
        const o = multiplexed ? 1 : 0;
        const v = new Uint8Array(e.target.value.buffer);
        const r = {};

        if (multiplexed) {
            r.elapsedTime =           (v[o+0] + (v[o+1] << 8) + (v[o+2] << 16)) * 0.01;
            r.distance =              (v[o+3] + (v[o+4] << 8) + (v[o+5] << 16)) * 0.1;
            r.driveLength =           v[o+6] * 0.01;
            r.driveTime =             v[o+7] * 0.01;
            r.strokeRecoveryTime =    (v[o+8] + (v[o+9] << 8)) * 0.01;
            r.strokeDistance =        (v[o+10] + (v[o+11] << 8)) * 0.01;
            r.peakDriveForce =        (v[o+12] + (v[o+13] << 8)) * 0.1;   /* XXX pounds */
            r.averageDriveForce =     (v[o+14] + (v[o+15] << 8)) * 0.1;   /* XXX pounds */
            r.strokeCount =           (v[o+16] + (v[o+17] << 8));
        } else {
            r.elapsedTime =           (v[o+0] + (v[o+1] << 8) + (v[o+2] << 16)) * 0.01;
            r.distance =              (v[o+3] + (v[o+4] << 8) + (v[o+5] << 16)) * 0.1;
            r.driveLength =           v[o+6] * 0.01;
            r.driveTime =             v[o+7] * 0.01;
            r.strokeRecoveryTime =    (v[o+8] + (v[o+9] << 8)) * 0.01;
            r.strokeDistance =        (v[o+10] + (v[o+11] << 8)) * 0.01;
            r.peakDriveForce =        (v[o+12] + (v[o+13] << 8)) * 0.1;   /* XXX pounds */
            r.averageDriveForce =     (v[o+14] + (v[o+15] << 8)) * 0.1;   /* XXX pounds */
            r.workPerStroke =         (v[o+16] + (v[o+17] << 8));
            r.strokeCount =           (v[o+18] + (v[o+19] << 8));
        }

        return r;
    }

    /*
     */
    _cbStrokeData(monitor, e, multiplexed = false) {
        const event = {
            type: multiplexed ? 'multiplexed-information' : 'stroke-data',
            source: monitor,
            raw: e.target.value,
            data: monitor._extractStrokeData(e, multiplexed)
        };

        monitor.eventTarget.dispatchEvent(event);
    }

    /*
     * CSAFE equivalent commands:
     *
     * elapsedTime              = N/A
     * strokePower              = CSAFE_PM_GET_STROKE_POWER
     * strokeCalories           = CSAFE_PM_GET_STROKE_CALORICBURNRATE
     * strokeCount              = CSAFE_PM_GET_STROKESTATS
     * projectedWorkTime        = N/A
     * projectedWorkDistance    = N/A
     * workPerStroke            = N/A
     */
    _extractAdditionalStrokeData(e, multiplexed = false) {
        const o = multiplexed ? 1 : 0;
        const v = new Uint8Array(e.target.value.buffer);
        const r = {};

        if (multiplexed) {
            r.elapsedTime =           (v[o+0] + (v[o+1] << 8) + (v[o+2] << 16)) * 0.01;
            r.strokePower =           (v[o+3] + (v[o+4] << 8));
            r.strokeCalories =        (v[o+5] + (v[o+6] << 8));
            r.strokeCount =           (v[o+7] + (v[o+8] << 8));
            r.projectedWorkTime =     (v[o+9] + (v[o+10] << 8) + (v[o+11] << 16));
            r.projectedWorkDistance = (v[o+12] + (v[o+13] << 8) + (v[o+14] << 16));
            r.workPerStroke =         (v[o+15] + (v[o+16] << 8));
        } else {
            r.elapsedTime =           (v[o+0] + (v[o+1] << 8) + (v[o+2] << 16)) * 0.01;
            r.strokePower =           (v[o+3] + (v[o+4] << 8));
            r.strokeCalories =        (v[o+5] + (v[o+6] << 8));
            r.strokeCount =           (v[o+7] + (v[o+8] << 8));
            r.projectedWorkTime =     (v[o+9] + (v[o+10] << 8) + (v[o+11] << 16));
            r.projectedWorkDistance = (v[o+12] + (v[o+13] << 8) + (v[o+14] << 16));
        }

        return r;
    }

    /*
     */
    _cbAdditionalStrokeData(monitor, e, multiplexed = false) {
        const event = {
            type: multiplexed ? 'multiplexed-information' : 'additional-stroke-data',
            source: monitor,
            raw: e.target.value,
            data: monitor._extractAdditionalStrokeData(e, multiplexed)
        };

        monitor.eventTarget.dispatchEvent(event);
    }

    /*
     * CSAFE equivalent commands:
     *
     * elapsedTime              = N/A
     * distance                 = N/A
     * splitIntervalTime        = N/A
     * splitIntervalDistance    = N/A
     * intervalRestTime         = N/A
     * intervalRestDistance     = N/A
     * splitIntervalType        = N/A
     * splitIntervalNumber      = N/A
     */
    _extractSplitIntervalData(e, multiplexed = false) {
        const o = multiplexed ? 1 : 0;
        const v = new Uint8Array(e.target.value.buffer);

        return {
            elapsedTime:            (v[o+0] + (v[o+1] << 8) + (v[o+2] << 16)) * 0.01,
            distance:               (v[o+3] + (v[o+4] << 8) + (v[o+5] << 16)) * 0.1,
            splitIntervalTime:      (v[o+6] + (v[o+7] << 8) + (v[o+8] << 16)) * 0.1,
            splitIntervalDistance:  (v[o+9] + (v[o+10] << 8) + (v[o+11] << 16)),
            intervalRestTime:       v[o+12] + (v[o+13] << 8),
            intervalRestDistance:   v[o+14] + (v[o+15] << 8),
            splitIntervalType:      v[o+16],
            splitIntervalNumber:    v[o+17]
        };
    }

    /*
     */
    _cbSplitIntervalData(monitor, e, multiplexed = false) {
        const event = {
            type: multiplexed ? 'multiplexed-information' : 'split-interval-data',
            source: monitor,
            raw: e.target.value,
            data: monitor._extractSplitIntervalData(e, multiplexed)
        };

        monitor.eventTarget.dispatchEvent(event);
    }

    /*
     * CSAFE equivalent commands:
     *
     * elapsedTime                      = N/A
     * splitIntervalAverageStrokeRate   = N/A
     * splitIntervalWorkHeartrate       = N/A
     * splitIntervalRestHeartRate       = N/A
     * splitIntervalAveragePace         = N/A
     * splitIntervalTotalCalories       = N/A
     * splitIntervalAverageCalories     = N/A
     * splitIntervalSpeed               = N/A
     * splitIntervalPower               = N/A
     * splitAverageDragFactor           = N/A
     * splitIntervalNumber              = N/A
     */
    _extractAdditionalSplitIntervalData(e, multiplexed = false) {
        const o = multiplexed ? 1 : 0;
        const v = new Uint8Array(e.target.value.buffer);

        return {
            elapsedTime:                    (v[o+0] + (v[o+1] << 8) + (v[o+2] << 16)) * 0.01,
            splitIntervalAverageStrokeRate: v[o+3],
            splitIntervalWorkHeartrate:     v[o+4],
            splitIntervalRestHeartRate:     v[o+5],
            splitIntervalAveragePace:       (v[o+6] + (v[o+7] << 8)) * 0.1,
            splitIntervalTotalCalories:     (v[o+8] + (v[o+9] << 8)),
            splitIntervalAverageCalories:   (v[o+10] + (v[o+11] << 8)),
            splitIntervalSpeed:             (v[o+12] + (v[o+13] << 8)) * 0.001,
            splitIntervalPower:             (v[o+14] + (v[o+15] << 8)),
            splitAverageDragFactor:         v[o+16],
            splitIntervalNumber:            v[o+17]
        };
    }

    /*
     */
    _cbAdditionalSplitIntervalData(monitor, e, multiplexed = false) {
        const event = {
            type: multiplexed ? 'multiplexed-information' : 'additional-split-interval-data',
            source: monitor,
            raw: e.target.value,
            data: monitor._extractAdditionalSplitIntervalData(e, multiplexed)
        };

        monitor.eventTarget.dispatchEvent(event);
    }

    /*
     * CSAFE equivalent commands:
     *
     * logEntryDate         = N/A
     * logEntryTime         = N/A
     * timeElapsed          = N/A
     * distance             = N/A
     * avgStrokeRate        = N/A
     * endingHeartRate      = N/A
     * averageHeartRate     = N/A
     * minHeartRate         = N/A
     * maxHeartRate         = N/A
     * dragFactorAverage    = N/A
     * recoveryHeartRate    = N/A
     * workoutType          = N/A
     * averagePace          = N/A
     */
    _extractEndOfWorkoutSummary(e, multiplexed = false) {
        const o = multiplexed ? 1 : 0;
        const v = new Uint8Array(e.target.value.buffer);
        const r = {};

        r.logEntryDate =      (v[o+0] + (v[o+1] << 8));
        r.logEntryTime =      (v[o+2] + (v[o+3] << 8));
        r.timeElapsed =       (v[o+4] + (v[o+5] << 8) + (v[o+6] << 16)) * 0.01;
        r.distance =          (v[o+7] + (v[o+8] << 8) + (v[o+9] << 16)) * 0.1;
        r.avgStrokeRate =     v[o+10];
        r.endingHeartRate =   v[o+11];
        r.averageHeartRate =  v[o+12];
        r.minHeartRate =      v[o+13];
        r.maxHeartRate =      v[o+14];
        r.dragFactorAverage = v[o+15];
        r.recoveryHeartRate = v[o+16];
        r.workoutType =       v[o+17];

        if (!multiplexed) {
            r.averagePace = (v[o+18] + (v[o+19] << 8)) * 0.1;
        }

        return r;
    }

    /*
     */
    _cbEndOfWorkoutSummaryData(monitor, e, multiplexed = false) {
        const event = {
            type: multiplexed ? 'multiplexed-information' : 'workout-end',
            source: monitor,
            raw: e.target.value,
            data: monitor._extractEndOfWorkoutSummary(e, multiplexed)
        };

        monitor.eventTarget.dispatchEvent(event);
    }

    /*
     */
    _extractAdditionalEndOfWorkoutSummary(e, multiplexed = false) {
        const o = multiplexed ? 1 : 0;
        const v = new Uint8Array(e.target.value.buffer);
        const r = {};

        r.logEntryDate =        (v[o+0] + (v[o+1] << 8));
        r.logEntryTime =        (v[o+2] + (v[o+3] << 8));

        if (!multiplexed) {
            r.splitIntervalType =   v[o+4];
        }

        r.splitIntervalSize =   (v[o+5] + (v[o+6] << 8));
        r.splitIntervalCount =  v[o+7];
        r.totalCalories =       (v[o+8] + (v[o+9] << 8));
        r.watts =               (v[o+10] + (v[o+11] << 8));
        r.totalRestDistance =   (v[o+12] + (v[o+13] << 8) + (v[o+14] << 16));
        r.intervalRestTime =    (v[o+15] + (v[o+16] << 8));
        r.averageCalories =     (v[o+17] + (v[o+18] << 8));

        return r;
    }

    /*
     */
    _cbAdditionalEndOfWorkoutSummaryData(monitor, e, multiplexed = false) {
        const event = {
            type: multiplexed ? 'multiplexed-information' : 'additional-workout-end',
            source: monitor,
            raw: e.target.value,
            data: monitor._extractAdditionalEndOfWorkoutSummary(e, multiplexed)
        };

        monitor.eventTarget.dispatchEvent(event);
    }

    /*
     */
    _extractHeartRateBeltInformation(e, multiplexed = false) {
        const o = multiplexed ? 1 : 0;
        const v = new Uint8Array(e.target.value.buffer);
        const r = {};

        r.manufacturerId =  v[o+0];
        r.deviceType =      v[o+1];
        r.beltId =          v[o+2] + (v[o+3] << 8) + (v[o+4] << 16) + (v[o+5] << 24);

        return r;
    }

    /*
     */
    _cbHeartRateBeltInformation(monitor, e, multiplexed = false) {
        const event = {
            type: multiplexed ? 'multiplexed-information' : 'heart-rate-belt-information',
            source: monitor,
            raw: e.target.value,
            data: monitor._extractHeartRateBeltInformation(e, multiplexed)
        };

        monitor.eventTarget.dispatchEvent(event);
    }

    /*
     */
    _extractAdditionalEndOfWorkoutSummaryData2(e, multiplexed = false) {
        const o = multiplexed ? 1 : 0;
        const v = new Uint8Array(e.target.value.buffer);
        const r = {};

        r.logEntryDate =      (v[o+0] + (v[o+1] << 8));
        r.logEntryTime =      (v[o+2] + (v[o+3] << 8));
        r.averagePace =       (v[o+4] + (v[o+5] << 8));
        r.gameIdentifierWorkoutVerified = v[o+6];
        r.gameScore =         (v[o+7] + (v[o+8] << 8));
        r.ergMachineType =    v[o+9];

        return r;
    }

    /*
     */
    _cbAdditionalEndOfWorkoutSummaryData2(monitor, e, multiplexed = false) {
        const event = {
            type: multiplexed ? 'multiplexed-information' : 'additional-workout-end2',
            source: monitor,
            raw: e.target.value,
            data: monitor._extractAdditionalEndOfWorkoutSummaryData2(e, multiplexed)
        };

        monitor.eventTarget.dispatchEvent(event);
    }

    /*
     */
    _cbMultiplexedInformation(monitor, e) {
        const characteristic = e.target.value.getUint8();

        /* XXX make this a jump table */
        switch (characteristic) {
            case 0x31: monitor._cbGeneralStatus(monitor, e, true); break;
            case 0x32: monitor._cbAdditionalStatus(monitor, e, true); break;
            case 0x33: monitor._cbAdditionalStatus2(monitor, e, true); break;
            case 0x35: monitor._cbStrokeData(monitor, e, true); break;
            case 0x36: monitor._cbAdditionalStrokeData(monitor, e, true); break;
            case 0x37: monitor._cbSplitIntervalData(monitor, e, true); break;
            case 0x38: monitor._cbAdditionalSplitIntervalData(monitor, e, true); break;
            case 0x39: monitor._cbEndOfWorkoutSummaryData(monitor, e, true); break;
            case 0x3a: monitor._cbAdditionalEndOfWorkoutSummaryData(monitor, e, true); break;
            case 0x3b: monitor._cbHeartRateBeltInformation(monitor, e, true); break;
            case 0x3c: monitor._cbAdditionalEndOfWorkoutSummaryData2(monitor, e, true); break;
            default:
                console.log('unhandled characteristic ' + characteristic.toString(16));
                break;
        }
    }

    /*
     */
    _getCharacteristic(characteristic) {
        const characteristicObject = this.idObjectMap.get(characteristic.id);

        if (characteristicObject) {
            return Promise.resolve(characteristicObject);
        }

        return this._getService(characteristic.service)
            .then(service => {
                return service.getCharacteristic(characteristic.id);
            })
            .then(c => {
                this.idObjectMap.set(characteristic.id, c);
                return Promise.resolve(c);
            })
            .catch(error => {
                console.log('getCharacteristic(' + characteristic.id + ') failed: ' + error);
                return Promise.reject(error);
            });
    }

    /*
     */
    _setupCharacteristicValueListener(characteristic, callback) {
        const monitor = this;

        return this._getCharacteristic(characteristic)
            .then(c => {
                return c.startNotifications();
            })
            .then(c => {
                c.addEventListener('characteristicvaluechanged', e => {
                    callback(monitor, e);
                });
                return Promise.resolve();
            })
            .catch(error => {
                console.log('_setupCharacteristicValueListener(' + characteristic.id + ') failed: ' + error);
                return Promise.reject(error);
            });
    }

    /*
     */
    _teardownCharacteristicValueListener(characteristic, callback) {
        const monitor = this;

        return this._getCharacteristic(characteristic)
            .then(c => {
                return c.stopNotifications();
            })
            .then(c => {
                c.removeEventListener('characteristicvaluechanged', e => {
                    callback(monitor, e);
                });
                return Promise.resolve();
            })
            .catch(error => {
                console.log('_teardownCharacteristicValueListener(' + characteristic.id + ') failed: ' + error);
                return Promise.reject(error);
            });
    }

    /*
     */
    _addWorkoutEndListener() {
        return this._setupCharacteristicValueListener(
                characteristics.rowingService.endOfWorkoutSummaryData, this._cbEndOfWorkoutSummaryData
        );
    }

    /*
     */
    _removeWorkoutEndListener() {
        return this._teardownCharacteristicValueListener(
                characteristics.rowingService.endOfWorkoutSummaryData, this._cbEndOfWorkoutSummaryData
        );
    }

    /*
     */
    _addGeneralStatusListener() {
        return this._setupCharacteristicValueListener(
                characteristics.rowingService.generalStatus, this._cbGeneralStatus
        );
    }

    /*
     */
    _removeGeneralStatusListener() {
        return this._teardownCharacteristicValueListener(
                characteristics.rowingService.generalStatus, this._cbGeneralStatus
        );
    }

    /*
     */
    _addMultiplexedInformationListener() {
        return this._setupCharacteristicValueListener(
                characteristics.rowingService.multiplexedInformation, this._cbMultiplexedInformation
        );
    }

    /*
     */
    _removeMultiplexedInformationListener() {
        return this._teardownCharacteristicValueListener(
                characteristics.rowingService.multiplexedInformation, this._cbMultiplexedInformation
        );
    }

    _addAdditionalStatus() {
        return this._setupCharacteristicValueListener(
                characteristics.rowingService.additionalStatus, this._cbAdditionalStatus
        );
    }

    _removeAdditionalStatus() {
        return this._teardownCharacteristicValueListener(
                characteristics.rowingService.additionalStatus, this._cbAdditionalStatus
        );
    }

    _addAdditionalStatus2() {
        return this._setupCharacteristicValueListener(
                characteristics.rowingService.additionalStatus2, this._cbAdditionalStatus2
        );
    }

    _removeAdditionalStatus2() {
        return this._teardownCharacteristicValueListener(
                characteristics.rowingService.additionalStatus2, this._cbAdditionalStatus2
        );
    }

    _addStrokeData() {
        return this._setupCharacteristicValueListener(
                characteristics.rowingService.strokeData, this._cbStrokeData
        );
    }

    _removeStrokeData() {
        return this._teardownCharacteristicValueListener(
                characteristics.rowingService.strokeData, this._cbStrokeData
        );
    }

    _addAdditionalStrokeData() {
        return this._setupCharacteristicValueListener(
                characteristics.rowingService.additionalStrokeData, this._cbAdditionalStrokeData
        );
    }

    _removeAdditionalStrokeData() {
        return this._teardownCharacteristicValueListener(
                characteristics.rowingService.additionalStrokeData, this._cbAdditionalStrokeData
        );
    }

    _addSplitIntervalData() {
        return this._setupCharacteristicValueListener(
                characteristics.rowingService.splitIntervalData, this._cbSplitIntervalData
        );
    }

    _removeSplitIntervalData() {
        return this._teardownCharacteristicValueListener(
                characteristics.rowingService.splitIntervalData, this._cbSplitIntervalData
        );
    }

    _addAdditionalSplitIntervalData() {
        return this._setupCharacteristicValueListener(
                characteristics.rowingService.additionalSplitIntervalData, this._cbAdditionalSplitIntervalData
        );
    }

    _removeAdditionalSplitIntervalData() {
        return this._teardownCharacteristicValueListener(
                characteristics.rowingService.additionalSplitIntervalData, this._cbAdditionalSplitIntervalData
        );
    }

    _addForceCurveData() {
        return this._setupCharacteristicValueListener(
                characteristics.rowingService.forceCurveData, this._cbForceCurveData
        );
    }

    _removeForceCurveData() {
        return this._teardownCharacteristicValueListener(
                characteristics.rowingService.forceCurveData, this._cbForceCurveData
        );
    }

    _addAdditionalEndOfWorkoutSummaryData() {
        return this._setupCharacteristicValueListener(
                characteristics.rowingService.forceCurveData, this._cbAdditionalEndOfWorkoutSummaryData
        );
    }

    _removeAdditionalEndOfWorkoutSummaryData() {
        return this._teardownCharacteristicValueListener(
                characteristics.rowingService.forceCurveData, this._cbAdditionalEndOfWorkoutSummaryData
        );
    }

    _addHeartRateBeltInformation() {
        return this._setupCharacteristicValueListener(
                characteristics.rowingService.forceCurveData, this._cbHeartRateBeltInformation
        );
    }

    _removeHeartRateBeltInformation() {
        return this._teardownCharacteristicValueListener(
                characteristics.rowingService.forceCurveData, this._cbHeartRateBeltInformation
        );
    }


    _addAdditionalEndOfWorkoutSummaryData2() {
        return this._setupCharacteristicValueListener(
                characteristics.rowingService.forceCurveData, this._cbAdditionalEndOfWorkoutSummaryData2
        );
    }

    _removeAdditionalEndOfWorkoutSummaryData2() {
        return this._teardownCharacteristicValueListener(
                characteristics.rowingService.forceCurveData, this._cbAdditionalEndOfWorkoutSummaryData2
        );
    }

    /*
     */
    _getStringCharacteristicValue(characteristic) {
        const decoder = new TextDecoder('utf-8');

        return this._getCharacteristic(characteristic)
            .then(c => {
                return c.readValue()
            })
            .then(v => {
                return decoder.decode(v);
            });
    }

    /*
     */
    getSerialNumber() {
        return this._getStringCharacteristicValue(characteristics.informationService.serialNumber);
    }

    /*
     */
    getHardwareRevision() {
        return this._getStringCharacteristicValue(characteristics.informationService.hardwareRevision);
    }

    /*
     */
    getFirmwareRevision() {
        return this._getStringCharacteristicValue(characteristics.informationService.firmwareRevision);
    }

    /*
     */
    getManufacturerName() {
        return this._getStringCharacteristicValue(characteristics.informationService.manufacturerName);
    }

    /*
     */
    getMonitorInformation() {
        const monitorInformation = {};

        return this.getSerialNumber()
            .then(serialNumber => {
                monitorInformation.serialNumber = serialNumber;
                return this.getHardwareRevision();
            })
            .then(hardwareRevision => {
                monitorInformation.hardwareRevision = hardwareRevision;
                return this.getFirmwareRevision();
            })
            .then(firmwareRevision => {
                monitorInformation.firmwareRevision = firmwareRevision;
                return this.getManufacturerName();
            })
            .then(manufacturerName => {
                monitorInformation.manufacturerName = manufacturerName;
                return Promise.resolve(monitorInformation);
            })
            .catch(error => {
                console.log(error);
                return Promise.reject(error);
            });
    }
};
