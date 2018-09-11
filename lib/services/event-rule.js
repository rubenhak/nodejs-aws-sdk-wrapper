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
    
    queryAll(prefix, nextToken, results)
    {
        if (!results) {
            results = [];
        }

        var params = {

        };
        if (prefix) {
            params.NamePrefix = prefix;
        }
        if (nextToken) {
            params.NextToken = nextToken;
        }

        this.logger.verbose('Fetching event rules ...',  params);
        return this._cloudwatchevents.listRules(params)
            .then(result => {
                return Promise.serial(result.Rules, x => this.query(x.Name))
                    .then(rules => {
                        results = _.concat(results, rules); 
                        if (result.NextToken) {
                            return this.queryAll(prefix, result.NextToken, results);
                        }
                        return results;           
                    })
            });
    }

    query(name)
    {
        var params = {
            Name: name
        };
        var rule = null;
        return this._cloudwatchevents.describeRule(params)
            .then(result => {
                rule = result;
                return this._getTargets(rule.Name);
            })
            .then(targets => {
                rule.Targets = targets;
                return rule;
            });
    }

    _getTargets(name, nextToken, results)
    {
        if (!results) {
            results = [];
        }

        var params = {
            Rule: name
        };
        if (nextToken) {
            params.NextToken = nextToken;
        }

        this.logger.verbose('Fetching event rule targets ...',  params);
        return this._cloudwatchevents.listTargetsByRule(params)
            .then(result => {
                results = _.concat(results, result.Targets); 
                if (result.NextToken) {
                    return this._getTargets(name, result.NextToken, results);
                }
                return results;           
            });
    }

    create(name, config)
    {
        var params;
        if (config) {
            params = _.clone(config);
        } else {
            params = {}
        }
        params.Name = name;
        this.logger.verbose('Creating event rule ...',  params);
        return this._cloudwatchevents.putRule(params)
            .then(result => {
                this.logger.verbose('Creating event rule result: ',  result);
                return this.query(name);
            });
    }

    delete(name)
    {
        var params = {
            Name: name
        };
        this.logger.verbose('Deleting event rule ...',  params);
        return this._cloudwatchevents.deleteRule(params)
            .then(result => {
                this.logger.verbose('Delete event rule result: ',  result);
            });
    }

    addRuleTarget(name, target)
    {
        var params = {
            Rule: name,
            Targets: [
                target
            ]
        };
        this.logger.verbose('Adding event rule target ...',  params);
        return this._cloudwatchevents.putTargets(params)
            .then(result => {
                this.logger.verbose('Event rule target add result: ',  result);
                if (result.FailedEntryCount > 0) {
                    throw new Error("Should retry.");
                }
            });
    }

    removeRuleTarget(name, target)
    {
        var params = {
            Rule: name,
            Ids: [
                target.Id
            ]
        };
        this.logger.verbose('Removing event rule target ...',  params);
        return this._cloudwatchevents.removeTargets(params)
            .then(result => {
                this.logger.verbose('Event rule target remove result: ',  result);
                if (result.FailedEntryCount > 0) {
                    throw new Error("Should retry.");
                }
            });
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
