const Promise = require('the-promise');
const _ = require('lodash');

class AWSEventRuleClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._cloudwatchevents = parent.getAwsService('cloudwatchevents');
    }

    setEnabled(name, isEnabled)
    {
        var params = {
            Name: name,
        };
        this.logger.info('Setting CloudWatchRule %s enabled=%s...', name, isEnabled);
        return Promise.resolve()
            .then(() => {
                if (isEnabled) {
                    return this._cloudwatchevents.enableRule(params);
                } else {
                    return this._cloudwatchevents.disableRule(params);
                }
            });
    }
}

module.exports = AWSEventRuleClient;
