const Promise = require('the-promise');
const _ = require('lodash');

class AWSTaskClient
{
    constructor(parent)
    {
        this._parent = parent;
        this._logger = parent._logger;
        this._ecs = parent._ecs;
    }

    query(clusterName, arn) {
        return this._ecs.describeTasks({ cluster: clusterName, tasks: [arn] }).promise()
            .then(data => {
                if (data.tasks.length > 0) {
                    var task = data.tasks[0];
                    this._logger.debug('Queried Task. %s', '', task);
                    return task;
                }
                return null;
            })
    }

    queryAll(clusterName) {
        return Promise.resolve()
            .then(data => {
                return new Promise((resolve, reject) => {
                    var result = [];
                    this._queryIdsX(resolve, reject, result, clusterName, null);
                });
            })
            .then(ids => {
                return Promise.serial(ids, x => {
                        return this.query(clusterName, x);
                    });
            });
    }

    _queryIdsX(resolve, reject, result, clusterName, next) {
        this._ecs.listTasks({
            cluster: clusterName,
            nextToken: next
         }).promise()
            .then(data => {
                result = result.concat(data.taskArns);
                if (data.nextToken) {
                    this._queryIdsX(resolve, reject, result, clusterName, data.nextToken);
                } else {
                    resolve(result);
                }
            })
            .catch(error => {
                resolve(result);
            });
    }

    run(clusterName, containerName, definition, env, containerInstanceArn) {
        var taskEnv = [];
        for (var name in env) {
            var val = env[name];
            if (val === null) {
                val = '';
            } else {
                val = val.toString();
            }
            taskEnv.push({
                name: name,
                value: val
            });
        }
        var params = {
            cluster: clusterName,
            taskDefinition: definition,
            overrides: {
                containerOverrides: [
                    {
                        name: containerName,
                        environment: taskEnv
                    }
                ]
            }
        };
        if (containerInstanceArn) {
            params.containerInstances = [
                containerInstanceArn
            ];
        } else {
            params.count = 1;
        }
        this._logger.info('Starting Task %s ...', definition);
        this._logger.verbose('Starting Task... %s', '', params);
        var p = null;
        if (containerInstanceArn) {
            p = this._ecs.startTask(params).promise();
        } else {
            p = this._ecs.runTask(params).promise();
        }
        return p
            .then(data => {
                this._logger.verbose('Task Start Result... %s', '', data);
                var task = data.tasks[0];
                return this.waitForTaskStatus(task, 'RUNNING');
            });
    }

    stop(task) {
        var params = {
            cluster: task.clusterArn,
            task: task.taskArn
        };

        this._logger.info('Stopping Task %s ...', task.taskArn);
        this._logger.verbose('Stopping Task... %s', '', params);
        return this._ecs.stopTask(params).promise()
            .then(data => {
                this._logger.verbose('Task Stop Result... %s', '', data);
                return this.waitForTaskStatus(data.task, 'STOPPED');
            });
    }

    waitForTaskStatus(task, status)
    {
        if (!task) {
            this._logger.warn('Cannot wait for task. It is not present.');
            return Promise.resolve();
        }

        this._logger.verbose('The task %s is %s/%s', task.taskArn, task.lastStatus, task.desiredStatus);
        if (task.lastStatus == status) {
            return Promise.resolve(task);
        }
        if (status == 'RUNNING') {
            if (task.lastStatus !== 'PENDING') {
                return Promise.resolve(task);
            }
        }

        this._logger.verbose('Waiting Task %s to %s...', task.taskArn, status);
        return Promise.timeout(2000)
            .then(() => {
                return this.query(task.clusterArn, task.taskArn);
            })
            .then(newTask => {
                return this.waitForTaskStatus(newTask, status);
            });
    }

}

module.exports = AWSTaskClient;
