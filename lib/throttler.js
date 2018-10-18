const _ = require('the-lodash');
const Promise = require('the-promise');
const uuid = require('uuid/v4');

class Throttler
{
    constructor(logger, config)
    {
        this._logger = logger;
        this._config = config;
        this._runningActions = {};
        this._processedDates = [];
        this._waitingActions = [];
        this._timer = null;
    }

    get limitByInterval() {
        return !this.limitByConcurrent;
    }

    get limitByConcurrent() {
        if (this._config.concurrent) {
            return true;
        }
        return false;
    }

    get interval() {
        return this._config.interval;
    }

    get number() {
        return this._config.number;
    }

    execute(action, name)
    {
        return new Promise((resolve, reject) => {
            var actionInfo = {
                id: uuid(),
                name: name,
                action: action,
                resolve: resolve,
                reject: reject
            };

            try
            {
                if (this._canRun())
                {
                    this._executeAction(actionInfo);
                }
                else
                {
                    this._waitingActions.push(actionInfo);
                }
                this._tryIntervalProcessor();
            }
            catch(error)
            {
                this._logger.warn('Failed in root for %s.', actionInfo.name, error);
                actionInfo.reject(error);
            }
        });
    }

    _canRun()
    {
        if (this.limitByInterval) {
            return this._processedDates.length < this.number;
        }
        if (this.limitByConcurrent) {
            return _.keys(this._runningActions).length < this.number;
        }
        throw new Error("Invalid Throttler Config.");        
    }

    _executeAction(actionInfo)
    {
        this._logger.info('Executing %s...', actionInfo.name);
        this._processedDates.push(new Date());
        this._runningActions[actionInfo.id] = actionInfo;
        try {
            var res = actionInfo.action;
            return Promise.resolve()
                .then(() => {
                    if (_.isFunction(res))
                    {
                        return res();
                    }
                    return res;
                })
                .then(result => {
                    this._logger.verbose('Completed %s.', actionInfo.name);
                    this._finishAction(actionInfo);
                    return actionInfo.resolve(result);
                })
                .catch(reason => {
                    this._logger.warn('Failed %s.', actionInfo.name);
                    this._finishAction(actionInfo);
                    return actionInfo.reject(reason);
                });
        } catch (e) {
            this._logger.warn('Failed %s.', actionInfo.name);
            this._finishAction(actionInfo);
            actionInfo.reject(e);
        }
    }

    _finishAction(actionInfo)
    {
        delete this._runningActions[actionInfo.id];
        this._tryConcurrentProcessor();
    }

    _tryConcurrentProcessor()
    {
        if (!this.limitByConcurrent) {
            return;
        }

        while((this._waitingActions.length > 0) && this._canRun())
        {
            var actionInfo = this._waitingActions.splice(0, 1)[0];
            this._executeAction(actionInfo);
        }
    }

    _tryIntervalProcessor()
    {
        if (!this.limitByInterval) {
            return;
        }

        if (this._timer) {
            return;
        }
        if (this._processedDates.length == 0) {
            return;
        }

        var minDate = _.min(this._processedDates);
        var deltaMs = this.interval - (new Date().getTime() - minDate.getTime());
        if (deltaMs < 50) {
            deltaMs = 50;
        }
        this._logger.silly('Pausing for %sms...', deltaMs);
        this._timer = setTimeout(() => {
            try
            {
                this._timer = null;
                var now = new Date();
                var cutOffTime = now.getTime() - this.interval;
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
                        this._tryIntervalProcessor();
                        return;
                    }
                }
            }
            catch(error)
            {
                this._logger.warn('Failed in _tryIntervalProcessor.', error);
            }
        }, deltaMs);
    }
}

module.exports = Throttler;
