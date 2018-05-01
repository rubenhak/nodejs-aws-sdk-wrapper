const _ = require('lodash');
const Promise = require('the-promise');

class Throttler
{
    constructor(logger, interval, number)
    {
        this._logger = logger;
        this._interval = interval;
        this._number = number;
        this._processedDates = [];
        this._waitingActions = [];
        this._timer = null;
    }

    execute(action, name)
    {
        return new Promise((resolve, reject) => {
            var actionInfo = {
                name: name,
                action: action,
                resolve: resolve,
                reject: reject
            };
            if (this._canRun())
            {
                this._executeAction(actionInfo);
            }
            else
            {
                this._waitingActions.push(actionInfo);
            }
            this._triggerProcess();
        });
    }

    _canRun()
    {
        return this._processedDates.length < this._number;
    }

    _executeAction(actionInfo)
    {
        this._logger.info('Executing %s...', actionInfo.name);
        this._processedDates.push(new Date());
        try {
            var res = actionInfo.action;
            if (_.isFunction(res))
            {
                res = res();
            }
            return Promise.resolve(res)
                .then(result => {
                    this._logger.verbose('Completed %s.', actionInfo.name);
                    actionInfo.resolve(result);
                })
                .catch(reson => {
                    this._logger.error('Failed %s.', actionInfo.name);
                    actionInfo.reject(reson)
                });
        } catch (e) {
            this._logger.error('Failed %s.', actionInfo.name);
            actionInfo.reject(e);
        }
    }

    _triggerProcess()
    {
        if (this._timer) {
            return;
        }
        if (this._processedDates.length == 0) {
            return;
        }

        var minDate = _.min(this._processedDates);
        var deltaMs = this._interval - (new Date().getTime() - minDate.getTime());
        if (deltaMs < 50) {
            deltaMs = 50;
        }
        this._logger.silly('Pausing for %sms...', deltaMs);
        this._timer = setTimeout(() => {
            this._timer = null;
            var now = new Date();
            var cutOffTime = now.getTime() - this._interval;
            _.remove(this._processedDates, x => x.getTime() <= cutOffTime);

            while(this._waitingActions.length > 0)
            {
                if (this._canRun())
                {
                    var actionInfo = this._waitingActions.splice(0, 1)[0];
                    this._executeAction(actionInfo);
                }
                else
                {
                    this._triggerProcess();
                    return;
                }
            }

        }, deltaMs);
    }
}

module.exports = Throttler;