const Promise = require('the-promise');
const _ = require('lodash');

class AWSCloudWatchClient
{
    constructor(parent)
    {
        this._parent = parent;
        this._logger = parent._logger;
        this._cloudwatchlogs = parent._cloudwatchlogs;
    }

    fetch(createIfNotPresent, name, tags)
    {
        this._logger.verbose('Fetching LogGroup %s...', name);

        return this.query(name)
            .then(result => {
                if (!createIfNotPresent || result) {
                    return result;
                } else {
                    return this.create(name, tags);
                }
            })
            .then(result => {
                this._logger.debug('Fetched LogGroup %s', '', result);
                return result;
            });
    }

    create(name, tags)
    {
        var params = {
                logGroupName: name,
                tags: tags
            };
        this._logger.info('Creating LogGroup %s...', params.logGroupName);
        this._logger.verbose('Creating LogGroup %s...', '', params);
        return this._cloudwatchlogs.createLogGroup(params).promise()
            .then(result => {
                return this.query(name);
            })
    }

    queryAllForCluster(cluster)
    {
        return this.queryAll()
            .then(groups => {
                return Promise.serial(groups, x => this._getGroupTagsCombined(x))
            })
            .then(groups => {
                return groups.filter(x => x.tags['berlioz:cluster'] == cluster);
            })
            // .then(groups => {
            //     return groups.filter(x => x.group);
            // })
            ;
    }

    _getGroupTagsCombined(group)
    {
        return this._getTags(group)
            .then(x => ({
                group: group,
                tags: x
            }));
    }

    _getTags(group) {
        var params = {
            logGroupName: group.logGroupName
        };
        return this._cloudwatchlogs.listTagsLogGroup(params).promise()
            .then(result => {
                return result.tags;
            });
    }

    queryAll(prevResults, next) {
        if (!prevResults) {
            prevResults = [];
        }
        var params = {
            nextToken: next
        };
        return this._cloudwatchlogs.describeLogGroups(params).promise()
            .then(result => {
                prevResults = prevResults.concat(result.logGroups);
                if (result.nextToken) {
                    return this.queryAll(prevResults, result.nextToken);
                }
                return prevResults;
            });
    }

    query(name) {
        var params = {
            logGroupNamePrefix: name
        };
        return this._cloudwatchlogs.describeLogGroups(params).promise()
            .then(result => {
                if (result.logGroups.length > 0) {
                    return this._getGroupTagsCombined(result.logGroups[0]);
                }
                return null;
            });
    }

    delete(name) {
        var params = {
            logGroupName: name
        };
        this._logger.info('Deleting LogGroup %s...', name);
        return this._cloudwatchlogs.deleteLogGroup(params).promise()
            .catch(reason => {
                this._logger.error(reason);
                return null;
            });
    }

    fetchLogs(groupName, streamName, nextToken)
    {
        var params = {
            logGroupName: groupName,
            logStreamName: streamName,
            nextToken: nextToken,
            startFromHead: true
        };
        this._logger.silly('Fetching Logs %s...', '', params);
        return this._cloudwatchlogs.getLogEvents(params).promise()
            .then(data => {
                this._logger.silly('Fetching Logs Result. Count: %s...', data.events.length);

                var result = {
                    events: data.events
                };
                if (nextToken != data.nextForwardToken) {
                    result.nextToken = data.nextForwardToken;
                }
                return result;
            });
    }

}

module.exports = AWSCloudWatchClient;
