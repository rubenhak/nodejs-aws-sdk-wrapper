const Promise = require('the-promise');
const _ = require('lodash');

class AWSTaskClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._ecs = parent.getAwsService('ecs');
    }

    query(clusterName, arn) {
        return this._ecs.describeTasks({ cluster: clusterName, tasks: [arn] })
            .then(data => {
                if (data.tasks.length > 0) {
                    var task = data.tasks[0];
                    this.logger.silly('Queried Task. %s', '', task);
                    return task;
                }
                return null;
            })
    }
    
    queryAll(clusterNamePrefix) {
        return Promise.resolve()
            .then(() => this.parent.Cluster.queryNames(clusterNamePrefix))
            .then(clusterNames => {
                return Promise.serial(clusterNames, x => this.queryAllForCluster(x))
            })
            .then(results => _.flattenDeep(results));
    }

    queryAllForCluster(clusterName, nextToken, results)
    {
        if (!results) {
            results = []
        }
        var params = {
            cluster: clusterName
        }
        if (nextToken) {
            params.nextToken = nextToken
        }
        return this._ecs.listTasks(params)
            .then(data => Promise.serial(data.taskArns, x => this.query(clusterName, x)))
            .then(data => {
                results = results.concat(data);
                if (data.nextToken) {
                    return this.queryAllForCluster(clusterName, data.nextToken, results);
                } else {
                    return results;
                }
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
        this.logger.info('Starting Task %s ...', definition);
        this.logger.verbose('Starting Task... %s', '', params);
        var p = null;
        if (containerInstanceArn) {
            p = this._ecs.startTask(params);
        } else {
            p = this._ecs.runTask(params);
        }
        return p
            .then(data => {
                this.logger.verbose('Task Start Result... %s', '', data);
                var task = data.tasks[0];
                return this.waitForTaskStatus(task, 'RUNNING');
            });
    }

    stop(task) {
        var params = {
            cluster: task.clusterArn,
            task: task.taskArn
        };

        this.logger.info('Stopping Task %s ...', task.taskArn);
        this.logger.verbose('Stopping Task... %s', '', params);
        return this._ecs.stopTask(params)
            .then(data => {
                this.logger.verbose('Task Stop Result... %s', '', data);
                return this.waitForTaskStatus(data.task, 'STOPPED');
            });
    }

    waitForTaskStatus(task, status)
    {
        if (!task) {
            this.logger.warn('Cannot wait for task. It is not present.');
            return Promise.resolve();
        }

        this.logger.verbose('The task %s is %s/%s', task.taskArn, task.lastStatus, task.desiredStatus);
        if (task.lastStatus == status) {
            return Promise.resolve(task);
        }
        if (status == 'RUNNING') {
            if (task.lastStatus !== 'PENDING') {
                return Promise.resolve(task);
            }
        }

        this.logger.verbose('Waiting Task %s to %s...', task.taskArn, status);
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
