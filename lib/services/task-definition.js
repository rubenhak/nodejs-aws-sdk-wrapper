const Promise = require('the-promise');
const _ = require('lodash');
const ConfigTools = require('../config-tools');

class AWSTaskDefinitionClient
{
    constructor(parent)
    {
        this._parent = parent;
        this._logger = parent._logger;
        this._ecs = parent._ecs;
    }

    setup(params)
    {
        this._logger.debug('Setting up TaskDefinition... %s', '', params);
        this._logger.verbose('Setting up TaskDefinition %s...', params.family);
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
                this._logger.debug('TaskDefinition was set up %s', '', taskDefinition);
                return taskDefinition;
            });
            ;
    }

    query(name) {
        var params = {
            taskDefinition: name
        };
        this._logger.silly('TaskDefinition query: %s', '', params);
        return this._ecs.describeTaskDefinition(params).promise()
            .then(result => {
                return result.taskDefinition;
            })
            .catch(reason => {
                if (reason && reason.statusCode == 400) {
                    return null;
                }
                this._logger.error('TaskDefinition query error %s', '', reason);
                return null;
            });
    }

    queryAll(cluster) {
        var params = {
            //taskDefinition: name
        };
        // return this._ecs.describeTaskDefinition(params).promise()
        //     .then(result => {
        //         return [result.taskDefinition];
        //     })
        //     .catch(reason => {
        //         return [];
        //     });
        return this._queryAllArns()
            // .then(arns => {
            //     return arns.filter(x => {
            //         var name = this._parent.shortenArn(x);
            //         return _.startsWith(name, cluster + '-')
            //     });
            // })
            .then(arns => {
                return Promise.serial(arns, x => this.query(x));
            })
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

    _queryAllArns(res, next) {
        if (!res) {
            res = [];
        }
        var params = {
            nextToken: next
        };
        return this._ecs.listTaskDefinitions(params).promise()
            .then(result => {
                //this._logger.info('TaskDefinitions %s', '', result.taskDefinitionArns);
                res = res.concat(result.taskDefinitionArns);
                if (result.nextToken) {
                    return _queryAllArns(res, result.nextToken);
                }
                return res;
            });
    }

    _create(params)
    {
        this._logger.info('Creating TaskDefinition %s...', params.family);
        this._logger.verbose('Creating TaskDefinition... %s', '', params);
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
        this._logger.info('Deleting TaskDefinition %s...', arn);
        this._logger.verbose('Deleting TaskDefinition... %s', '', params);
        return this._ecs.deregisterTaskDefinition(params).promise()
            .then(result => {
            });
    }
}

module.exports = AWSTaskDefinitionClient;