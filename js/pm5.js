'use strict';

/*
 * Minimal usage:
 *
 *  const m = new PM5(
 *      () => { },          // connecting
 *      () => { },          // connected
 *      () => { },          // disconnected
 *      (event) => { }      // message: event.type, event.data
 *  );
 *
 *  // Bluetooth connections require a user gesture:
 *  document.querySelector('#connect').addEventListener('click', () => {
 *      m.connected() ? m.doDisconnect() : m.doConnect();
 *  });
 */

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
    discovery:   { id: 'ce060000-43e5-11e4-916c-0800200c9a66' },
    information: { id: 'ce060010-43e5-11e4-916c-0800200c9a66' },
    control:     { id: 'ce060020-43e5-11e4-916c-0800200c9a66' },
    rowing:      { id: 'ce060030-43e5-11e4-916c-0800200c9a66' }
};

const characteristics = {
    informationService: {
        serialNumber:     { id: 'ce060012-43e5-11e4-916c-0800200c9a66', service: services.information },
        hardwareRevision: { id: 'ce060013-43e5-11e4-916c-0800200c9a66', service: services.information },
        firmwareRevision: { id: 'ce060014-43e5-11e4-916c-0800200c9a66', service: services.information },
        manufacturerName: { id: 'ce060015-43e5-11e4-916c-0800200c9a66', service: services.information }
    },
    controlService: {
        transmit: { id: 'ce060021-43e5-11e4-916c-0800200c9a66', service: services.control },
        receive:  { id: 'ce060022-43e5-11e4-916c-0800200c9a66', service: services.control }
    },
    rowingService: {
        generalStatus:                      { id: 'ce060031-43e5-11e4-916c-0800200c9a66', service: services.rowing },
        additionalStatus:                   { id: 'ce060032-43e5-11e4-916c-0800200c9a66', service: services.rowing },
        additionalStatus2:                  { id: 'ce060033-43e5-11e4-916c-0800200c9a66', service: services.rowing },
        generalStatusRate:                  { id: 'ce060034-43e5-11e4-916c-0800200c9a66', service: services.rowing },
        strokeData:                         { id: 'ce060035-43e5-11e4-916c-0800200c9a66', service: services.rowing },
        additionalStrokeData:               { id: 'ce060036-43e5-11e4-916c-0800200c9a66', service: services.rowing },
        splitIntervalData:                  { id: 'ce060037-43e5-11e4-916c-0800200c9a66', service: services.rowing },
        additionalSplitIntervalData:        { id: 'ce060038-43e5-11e4-916c-0800200c9a66', service: services.rowing },
        endOfWorkoutSummaryData:            { id: 'ce060039-43e5-11e4-916c-0800200c9a66', service: services.rowing },
        additionalEndOfWorkoutSummaryData:  { id: 'ce06003a-43e5-11e4-916c-0800200c9a66', service: services.rowing },
        heartRateBeltInformation:           { id: 'ce06003b-43e5-11e4-916c-0800200c9a66', service: services.rowing },
        additionalEndOfWorkoutSummaryData2: { id: 'ce06003c-43e5-11e4-916c-0800200c9a66', service: services.rowing },
        forceCurveData:                     { id: 'ce06003d-43e5-11e4-916c-0800200c9a66', service: services.rowing },
        multiplexedInformation:             { id: 'ce060080-43e5-11e4-916c-0800200c9a66', service: services.rowing }
    }
};

class PM5 extends EventTarget {

    // Maps event type name -> [rowingService characteristic key, handler method name]
    static _characteristicHandlers = {
        'general-status':                 ['generalStatus',                      '_cbGeneralStatus'],
        'additional-status':              ['additionalStatus',                   '_cbAdditionalStatus'],
        'additional-status2':             ['additionalStatus2',                  '_cbAdditionalStatus2'],
        'stroke-data':                    ['strokeData',                         '_cbStrokeData'],
        'additional-stroke-data':         ['additionalStrokeData',               '_cbAdditionalStrokeData'],
        'split-interval-data':            ['splitIntervalData',                  '_cbSplitIntervalData'],
        'additional-split-interval-data': ['additionalSplitIntervalData',        '_cbAdditionalSplitIntervalData'],
        'workout-end':                    ['endOfWorkoutSummaryData',             '_cbEndOfWorkoutSummaryData'],
        'additional-workout-end':         ['additionalEndOfWorkoutSummaryData',  '_cbAdditionalEndOfWorkoutSummaryData'],
        'heart-rate-belt-information':    ['heartRateBeltInformation',           '_cbHeartRateBeltInformation'],
        'additional-workout-end2':        ['additionalEndOfWorkoutSummaryData2', '_cbAdditionalEndOfWorkoutSummaryData2'],
        'multiplexed-information':        ['multiplexedInformation',             '_cbMultiplexedInformation'],
        // force-curve-data omitted: characteristic ce06003d not present in the
        // rowing service per the spec (NotFoundError in practice).
    };

    // Maps multiplexed characteristic byte -> handler method name
    static _multiplexedHandlers = {
        0x31: '_cbGeneralStatus',
        0x32: '_cbAdditionalStatus',
        0x33: '_cbAdditionalStatus2',
        0x35: '_cbStrokeData',
        0x36: '_cbAdditionalStrokeData',
        0x37: '_cbSplitIntervalData',
        0x38: '_cbAdditionalSplitIntervalData',
        0x39: '_cbEndOfWorkoutSummaryData',
        0x3a: '_cbAdditionalEndOfWorkoutSummaryData',
        0x3b: '_cbHeartRateBeltInformation',
        0x3c: '_cbAdditionalEndOfWorkoutSummaryData2',
    };

    constructor(cb_connecting, cb_connected, cb_disconnected, cb_message) {
        super();
        this._idObjectMap = new Map();  // service/characteristic id -> BT object cache
        this._listenerMap = new Map();  // characteristic id -> bound handler (for removal)

        this.cb_connecting = cb_connecting;
        this.cb_connected = cb_connected;
        this.cb_disconnected = cb_disconnected;
        this.cb_message = cb_message;
    }

    async doConnect() {
        try {
            await this.connect();
            this.cb_connecting();
            await this.addEventListener('multiplexed-information', this.cb_message);
            this.addEventListener('disconnect', this.cb_disconnected);
            this.cb_connected();
        } catch (error) {
            console.log(error);
        }
    }

    async doDisconnect() {
        try {
            await this.removeEventListener('multiplexed-information', this.cb_message);
            this.removeEventListener('disconnect', this.cb_disconnected);
            this.disconnect();
        } catch (error) {
            console.log(error);
        }
    }

    addEventListener(type, callback) {
        super.addEventListener(type, callback);
        const entry = PM5._characteristicHandlers[type];
        if (entry) {
            const [charName, cbName] = entry;
            return this._setupCharacteristicValueListener(
                characteristics.rowingService[charName],
                (e) => this[cbName](e)
            );
        }
    }

    removeEventListener(type, callback) {
        super.removeEventListener(type, callback);
        if (!this.connected()) return Promise.resolve();
        const entry = PM5._characteristicHandlers[type];
        if (entry) {
            const [charName] = entry;
            return this._teardownCharacteristicValueListener(characteristics.rowingService[charName]);
        }
        return Promise.resolve();
    }

    async connect() {
        if (!navigator.bluetooth) {
            throw new Error('Bluetooth not available');
        }

        const device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [services.discovery.id] }],
            optionalServices: [
                services.information.id,
                services.control.id,
                services.rowing.id
            ]
        });

        this.device = device;

        const onGattDisconnect = () => {
            this.device.removeEventListener('gattserverdisconnected', onGattDisconnect);
            this._idObjectMap.clear();
            this._listenerMap.clear();
            this.dispatchEvent(new Event('disconnect'));
        };
        this.device.addEventListener('gattserverdisconnected', onGattDisconnect);

        this.server = await device.gatt.connect();
    }

    disconnect() {
        if (!this.connected()) {
            console.log("disconnect: wasn't connected");
            return;
        }
        this.device.gatt.disconnect();
    }

    connected() {
        return this.device?.gatt?.connected ?? false;
    }

    async _getService(service) {
        if (this._idObjectMap.has(service.id)) {
            return this._idObjectMap.get(service.id);
        }
        try {
            const s = await this.server.getPrimaryService(service.id);
            this._idObjectMap.set(service.id, s);
            return s;
        } catch (error) {
            console.log(`getPrimaryService(${service.id}) failed`);
            throw error;
        }
    }

    async _getCharacteristic(characteristic) {
        if (this._idObjectMap.has(characteristic.id)) {
            return this._idObjectMap.get(characteristic.id);
        }
        try {
            const service = await this._getService(characteristic.service);
            const c = await service.getCharacteristic(characteristic.id);
            this._idObjectMap.set(characteristic.id, c);
            return c;
        } catch (error) {
            console.log(`getCharacteristic(${characteristic.id}) failed: ${error}`);
            throw error;
        }
    }

    async _setupCharacteristicValueListener(characteristic, handler) {
        try {
            const c = await this._getCharacteristic(characteristic);
            await c.startNotifications();
            this._listenerMap.set(characteristic.id, handler);
            c.addEventListener('characteristicvaluechanged', handler);
        } catch (error) {
            console.log(`_setupCharacteristicValueListener(${characteristic.id}) failed: ${error}`);
            throw error;
        }
    }

    async _teardownCharacteristicValueListener(characteristic) {
        try {
            const c = await this._getCharacteristic(characteristic);
            await c.stopNotifications();
            const handler = this._listenerMap.get(characteristic.id);
            if (handler) {
                c.removeEventListener('characteristicvaluechanged', handler);
                this._listenerMap.delete(characteristic.id);
            }
        } catch (error) {
            console.log(`_teardownCharacteristicValueListener(${characteristic.id}) failed: ${error}`);
            throw error;
        }
    }

    _dispatch(type, e, data) {
        const event = new Event(type);
        event.source = this;
        event.raw = e.target.value;
        event.data = data;
        this.dispatchEvent(event);
    }

    _cbMultiplexedInformation(e) {
        const id = e.target.value.getUint8(0);
        const handlerName = PM5._multiplexedHandlers[id];
        if (handlerName) {
            this[handlerName](e, true);
        } else {
            console.log(`unhandled characteristic 0x${id.toString(16)}`);
        }
    }

    // 0x003d is not multiplexed
    _cbForceCurveData(e) {
        const v = new Uint8Array(e.target.value.buffer);
        const numCharacteristics = (v[0] >> 4) & 0x0f;
        const numDataPoints = v[0] & 0x0f;
        const sequenceNumber = v[1];
        const data = [];

        for (let i = 2; i <= numDataPoints * 2; i += 2) {
            data.push(v[i] + (v[i + 1] << 8));
        }

        this._dispatch('force-curve-data', e, { numCharacteristics, numDataPoints, sequenceNumber, data });
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

        const data = {
            elapsedTime:         (v[o+0] + (v[o+1] << 8) + (v[o+2] << 16)) * 0.01,
            distance:            (v[o+3] + (v[o+4] << 8) + (v[o+5] << 16)) * 0.1,
            workoutType:         v[o+6],
            intervalType:        v[o+7],
            workoutState:        v[o+8],
            rowingState:         v[o+9],
            strokeState:         v[o+10],
            totalWorkDistance:   (v[o+11] + (v[o+12] << 8) + (v[o+13] << 16)),
            workoutDuration:     (v[o+14] + (v[o+15] << 8) + (v[o+16] << 16)),
            workoutDurationType: v[o+17],
            dragFactor:          v[o+18]
        };

        /*
         * C2 BT CID: page 11, 0x0031 characteristic
         * "Workout Duration Lo (if time, 0.01 sec lsb)"
         *
         * enum DurationTypes {
         *      CSAFE_TIME_DURATION     = 0,
         *      CSAFE_CALORIES_DURATION = 0x40,
         *      CSAFE_DISTANCE_DURATION = 0x80,
         *      CSAFE_WATTS_DURATION    = 0xc0
         * }
         */
        if (data.workoutDurationType == 0x0) {
            data.workoutDuration *= 0.01;
        }

        return data;
    }

    _cbGeneralStatus(e, multiplexed = false) {
        this._dispatch(
            multiplexed ? 'multiplexed-information' : 'general-status',
            e,
            this._extractGeneralStatus(e, multiplexed)
        );
    }

    /*
     * CSAFE equivalent commands:
     *
     * elapsedTime  = N/A
     * speed        = CSAFE_GETSPEED
     * strokeRate   = CSAFE_PM_GET_STROKESTATE
     * heartRate    = CSAFE_PM_GET_AVG_HEARTRATE
     * currentPace  = N/A
     * averagePace  = CSAFE_PM_GET_TOTAL_AVG_500MPACE
     * restDistance = CSAFE_PM_GET_RESTDISTANCE
     * restTime     = CSAFE_PM_GET_RESTTIME
     */
    _extractAdditionalStatus(e, multiplexed = false) {
        const o = multiplexed ? 1 : 0;
        const v = new Uint8Array(e.target.value.buffer);
        const r = {
            elapsedTime:  (v[o+0] + (v[o+1] << 8) + (v[o+2] << 16)) * 0.01,
            speed:        (v[o+3] + (v[o+4] << 8)) * 0.001,
            strokeRate:   v[o+5],
            heartRate:    v[o+6],
            currentPace:  (v[o+7] + (v[o+8] << 8)) * 0.01,
            averagePace:  (v[o+9] + (v[o+10] << 8)) * 0.01,
            restDistance: (v[o+11] + (v[o+12] << 8)),
            restTime:     (v[o+13] + (v[o+14] << 8) + (v[o+15] << 16)) * 0.01,
        };

        if (multiplexed) {
            r.averagePower   = v[o+16] + (v[o+17] << 8);
            r.ergMachineType = v[o+18];
        } else {
            r.ergMachineType = v[o+16];
        }

        return r;
    }

    _cbAdditionalStatus(e, multiplexed = false) {
        this._dispatch(
            multiplexed ? 'multiplexed-information' : 'additional-status',
            e,
            this._extractAdditionalStatus(e, multiplexed)
        );
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

        const r = {
            elapsedTime:   (v[o+0] + (v[o+1] << 8) + (v[o+2] << 16)) * 0.01,
            intervalCount: v[o+3],
        };

        if (!multiplexed) {
            r.averagePower = (v[o+4] + (v[o+5] << 8));
        }

        // Non-multiplexed has averagePower at o+4..5, shifting subsequent fields by 2 bytes
        const p = multiplexed ? 0 : 2;
        r.totalCalories       = (v[o+4+p]  + (v[o+5+p]  << 8));
        r.splitAveragePace    = (v[o+6+p]  + (v[o+7+p]  << 8)) * 0.01;
        r.splitAveragePower   = (v[o+8+p]  + (v[o+9+p]  << 8));
        r.splitAverageCalories= (v[o+10+p] + (v[o+11+p] << 8));
        r.lastSplitTime       = (v[o+12+p] + (v[o+13+p] << 8) + (v[o+14+p] << 16));
        r.lastSplitDistance   = (v[o+15+p] + (v[o+16+p] << 8) + (v[o+17+p] << 16));

        return r;
    }

    _cbAdditionalStatus2(e, multiplexed = false) {
        this._dispatch(
            multiplexed ? 'multiplexed-information' : 'additional-status2',
            e,
            this._extractAdditionalStatus2(e, multiplexed)
        );
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

        const r = {
            elapsedTime:       (v[o+0] + (v[o+1] << 8) + (v[o+2] << 16)) * 0.01,
            distance:          (v[o+3] + (v[o+4] << 8) + (v[o+5] << 16)) * 0.1,
            driveLength:       v[o+6] * 0.01,
            driveTime:         v[o+7] * 0.01,
            strokeRecoveryTime:(v[o+8] + (v[o+9] << 8)) * 0.01,
            strokeDistance:    (v[o+10] + (v[o+11] << 8)) * 0.01,
            peakDriveForce:    (v[o+12] + (v[o+13] << 8)) * 0.1,   /* pounds */
            averageDriveForce: (v[o+14] + (v[o+15] << 8)) * 0.1,   /* pounds */
        };

        if (multiplexed) {
            r.strokeCount = (v[o+16] + (v[o+17] << 8));
        } else {
            r.workPerStroke = (v[o+16] + (v[o+17] << 8));
            r.strokeCount   = (v[o+18] + (v[o+19] << 8));
        }

        return r;
    }

    _cbStrokeData(e, multiplexed = false) {
        this._dispatch(
            multiplexed ? 'multiplexed-information' : 'stroke-data',
            e,
            this._extractStrokeData(e, multiplexed)
        );
    }

    /*
     * CSAFE equivalent commands:
     *
     * elapsedTime          = N/A
     * strokePower          = CSAFE_PM_GET_STROKE_POWER
     * strokeCalories       = CSAFE_PM_GET_STROKE_CALORICBURNRATE
     * strokeCount          = CSAFE_PM_GET_STROKESTATS
     * projectedWorkTime    = N/A
     * projectedWorkDistance= N/A
     * workPerStroke        = N/A
     */
    _extractAdditionalStrokeData(e, multiplexed = false) {
        const o = multiplexed ? 1 : 0;
        const v = new Uint8Array(e.target.value.buffer);

        const r = {
            elapsedTime:          (v[o+0] + (v[o+1] << 8) + (v[o+2] << 16)) * 0.01,
            strokePower:          (v[o+3] + (v[o+4] << 8)),
            strokeCalories:       (v[o+5] + (v[o+6] << 8)),
            strokeCount:          (v[o+7] + (v[o+8] << 8)),
            projectedWorkTime:    (v[o+9] + (v[o+10] << 8) + (v[o+11] << 16)),
            projectedWorkDistance:(v[o+12] + (v[o+13] << 8) + (v[o+14] << 16)),
        };

        if (multiplexed) {
            r.workPerStroke = (v[o+15] + (v[o+16] << 8));
        } else {
            r.projectedWorkOther = (v[o+15] + (v[o+16] << 8) + (v[o+17] << 16));
        }

        return r;
    }

    _cbAdditionalStrokeData(e, multiplexed = false) {
        this._dispatch(
            multiplexed ? 'multiplexed-information' : 'additional-stroke-data',
            e,
            this._extractAdditionalStrokeData(e, multiplexed)
        );
    }

    /*
     * CSAFE equivalent commands: all N/A
     */
    _extractSplitIntervalData(e, multiplexed = false) {
        const o = multiplexed ? 1 : 0;
        const v = new Uint8Array(e.target.value.buffer);

        return {
            elapsedTime:           (v[o+0] + (v[o+1] << 8) + (v[o+2] << 16)) * 0.01,
            distance:              (v[o+3] + (v[o+4] << 8) + (v[o+5] << 16)) * 0.1,
            splitIntervalTime:     (v[o+6] + (v[o+7] << 8) + (v[o+8] << 16)) * 0.1,
            splitIntervalDistance: (v[o+9] + (v[o+10] << 8) + (v[o+11] << 16)),
            intervalRestTime:      v[o+12] + (v[o+13] << 8),
            intervalRestDistance:  v[o+14] + (v[o+15] << 8),
            splitIntervalType:     v[o+16],
            splitIntervalNumber:   v[o+17]
        };
    }

    _cbSplitIntervalData(e, multiplexed = false) {
        this._dispatch(
            multiplexed ? 'multiplexed-information' : 'split-interval-data',
            e,
            this._extractSplitIntervalData(e, multiplexed)
        );
    }

    /*
     * CSAFE equivalent commands: all N/A
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

    _cbAdditionalSplitIntervalData(e, multiplexed = false) {
        this._dispatch(
            multiplexed ? 'multiplexed-information' : 'additional-split-interval-data',
            e,
            this._extractAdditionalSplitIntervalData(e, multiplexed)
        );
    }

    /*
     * CSAFE equivalent commands: all N/A
     */
    _extractEndOfWorkoutSummary(e, multiplexed = false) {
        const o = multiplexed ? 1 : 0;
        const v = new Uint8Array(e.target.value.buffer);

        const r = {
            logEntryDate:      (v[o+0] + (v[o+1] << 8)),
            logEntryTime:      (v[o+2] + (v[o+3] << 8)),
            timeElapsed:       (v[o+4] + (v[o+5] << 8) + (v[o+6] << 16)) * 0.01,
            distance:          (v[o+7] + (v[o+8] << 8) + (v[o+9] << 16)) * 0.1,
            avgStrokeRate:     v[o+10],
            endingHeartRate:   v[o+11],
            averageHeartRate:  v[o+12],
            minHeartRate:      v[o+13],
            maxHeartRate:      v[o+14],
            dragFactorAverage: v[o+15],
            recoveryHeartRate: v[o+16],
            workoutType:       v[o+17],
        };

        if (!multiplexed) {
            r.averagePace = (v[o+18] + (v[o+19] << 8)) * 0.1;
        }

        return r;
    }

    _cbEndOfWorkoutSummaryData(e, multiplexed = false) {
        this._dispatch(
            multiplexed ? 'multiplexed-information' : 'workout-end',
            e,
            this._extractEndOfWorkoutSummary(e, multiplexed)
        );
    }

    _extractAdditionalEndOfWorkoutSummary(e, multiplexed = false) {
        const o = multiplexed ? 1 : 0;
        const v = new Uint8Array(e.target.value.buffer);

        const r = {
            logEntryDate:      (v[o+0] + (v[o+1] << 8)),
            logEntryTime:      (v[o+2] + (v[o+3] << 8)),
        };

        if (!multiplexed) {
            r.splitIntervalType = v[o+4];
        }

        // Non-mux has splitIntervalType at o+4 (1 byte), shifting Size to o+5.
        // Multiplexed omits that byte, so Size starts at o+4.
        const s = multiplexed ? o+4 : o+5;
        r.splitIntervalSize  = (v[s+0] + (v[s+1] << 8));
        r.splitIntervalCount = v[s+2];
        r.totalCalories      = (v[s+3] + (v[s+4] << 8));
        r.watts              = (v[s+5] + (v[s+6] << 8));
        r.totalRestDistance  = (v[s+7] + (v[s+8] << 8) + (v[s+9] << 16));
        r.intervalRestTime   = (v[s+10] + (v[s+11] << 8));
        r.averageCalories    = (v[s+12] + (v[s+13] << 8));

        return r;
    }

    _cbAdditionalEndOfWorkoutSummaryData(e, multiplexed = false) {
        this._dispatch(
            multiplexed ? 'multiplexed-information' : 'additional-workout-end',
            e,
            this._extractAdditionalEndOfWorkoutSummary(e, multiplexed)
        );
    }

    _extractHeartRateBeltInformation(e, multiplexed = false) {
        const o = multiplexed ? 1 : 0;
        const v = new Uint8Array(e.target.value.buffer);

        return {
            manufacturerId: v[o+0],
            deviceType:     v[o+1],
            beltId:         v[o+2] + (v[o+3] << 8) + (v[o+4] << 16) + (v[o+5] << 24)
        };
    }

    _cbHeartRateBeltInformation(e, multiplexed = false) {
        this._dispatch(
            multiplexed ? 'multiplexed-information' : 'heart-rate-belt-information',
            e,
            this._extractHeartRateBeltInformation(e, multiplexed)
        );
    }

    _extractAdditionalEndOfWorkoutSummaryData2(e, multiplexed = false) {
        const o = multiplexed ? 1 : 0;
        const v = new Uint8Array(e.target.value.buffer);

        return {
            logEntryDate:                  (v[o+0] + (v[o+1] << 8)),
            logEntryTime:                  (v[o+2] + (v[o+3] << 8)),
            averagePace:                   (v[o+4] + (v[o+5] << 8)),
            gameIdentifierWorkoutVerified: v[o+6],
            gameScore:                     (v[o+7] + (v[o+8] << 8)),
            ergMachineType:                v[o+9],
            totalWattMinutes:              (v[o+10] + (v[o+11] << 8) + (v[o+12] << 16))
        };
    }

    _cbAdditionalEndOfWorkoutSummaryData2(e, multiplexed = false) {
        this._dispatch(
            multiplexed ? 'multiplexed-information' : 'additional-workout-end2',
            e,
            this._extractAdditionalEndOfWorkoutSummaryData2(e, multiplexed)
        );
    }

    async _getStringCharacteristicValue(characteristic) {
        const decoder = new TextDecoder('utf-8');
        const c = await this._getCharacteristic(characteristic);
        const v = await c.readValue();
        return decoder.decode(v);
    }

    getSerialNumber() {
        return this._getStringCharacteristicValue(characteristics.informationService.serialNumber);
    }

    getHardwareRevision() {
        return this._getStringCharacteristicValue(characteristics.informationService.hardwareRevision);
    }

    getFirmwareRevision() {
        return this._getStringCharacteristicValue(characteristics.informationService.firmwareRevision);
    }

    getManufacturerName() {
        return this._getStringCharacteristicValue(characteristics.informationService.manufacturerName);
    }

    async getMonitorInformation() {
        const [serialNumber, hardwareRevision, firmwareRevision, manufacturerName] = await Promise.all([
            this.getSerialNumber(),
            this.getHardwareRevision(),
            this.getFirmwareRevision(),
            this.getManufacturerName()
        ]);
        return { serialNumber, hardwareRevision, firmwareRevision, manufacturerName };
    }
}
