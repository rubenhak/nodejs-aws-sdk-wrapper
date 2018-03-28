const Promise = require('the-promise');
const _ = require('lodash');
const ConfigTools = require('../config-tools');

class AWSTaskDefinitionClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._ecs = parent.getAwsService('ecs');
    }

    setup(params)
    {
        this.logger.debug('Setting up TaskDefinition... %s', '', params);
        this.logger.verbose('Setting up TaskDefinition %s...', params.family);
        return this.query(params.family)
            .then(taskDefinition => {
                if (taskDefinition != null)
                {
                    if (ConfigTools.areSame(params, taskDefinition)) {
                        return taskDefinition;
                    }
                }
                return this._create(params);
            })
            .then(taskDefinition => {
                this.logger.debug('TaskDefinition was set up %s', '', taskDefinition);
                return taskDefinition;
            });
            ;
    }

    query(name) {
        var params = {
            taskDefinition: name
        };
        this.logger.silly('TaskDefinition query: %s', '', params);
        return this._ecs.describeTaskDefinition(params).promise()
            .then(result => {
                return result.taskDefinition;
            })
            .catch(reason => {
                if (reason && reason.statusCode == 400) {
                    return null;
                }
                this.logger.error('TaskDefinition query error %s', '', reason);
                return null;
            });
    }

    queryAll(familyPrefix) {
        return this._queryAllArns(familyPrefix)
            .then(arns => Promise.serial(arns, x => this.query(x)))
            .then(result => {
                var resLatest = [];
                var dict = _.groupBy(result, x => x.family);
                for(var defs of _.values(dict)) {
                    var latest = _.maxBy(defs, x => x.revision);
                    resLatest.push(latest);
                }
                return resLatest;
            });
    }

    _queryAllArns(prefix, res, next) {
        if (!res) {
            res = [];
        }
        var params = {
            nextToken: next
        };
        this.logger.verbose('Query TaskDefinition with prefix %s ... ', prefix, params);
        return this._ecs.listTaskDefinitions(params).promise()
            .then(result => {
                this.logger.verbose('TaskDefinitions Query Result: ', result.taskDefinitionArns);
                var arns = result.taskDefinitionArns.filter(x => {
                    var name = this.parent.shortenArn(x);
                    return _.startsWith(name, prefix);
                });
                res = res.concat(arns);
                if (result.nextToken) {
                    return _queryAllArns(familyPrefix, res, result.nextToken);
                }
                return res;
            });
    }

    _create(params)
    {
        this.logger.info('Creating TaskDefinition %s...', params.family);
        this.logger.verbose('Creating TaskDefinition...', params);
        return this._ecs.registerTaskDefinition(params).promise()
            .then(result => {
                var taskDefinition = result.taskDefinition;
                return taskDefinition;
            });
    }

    delete(arn)
    {
        var params = {
            taskDefinition: arn
        }
        this.logger.info('Deleting TaskDefinition %s...', arn);
        this.logger.verbose('Deleting TaskDefinition... %s', '', params);
        return this._ecs.deregisterTaskDefinition(params).promise()
            .then(result => {
            });
    }
}

module.exports = AWSTaskDefinitionClient;
