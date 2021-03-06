const Promise = require('the-promise');
const _ = require('the-lodash');

class AWSCloudWatchClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._cloudwatchlogs = parent.getAwsService('cloudwatchlogs');
    }

    fetch(createIfNotPresent, name, tags)
    {
        this.logger.verbose('Fetching LogGroup %s...', name);

        return this.query(name)
            .then(result => {
                if (!createIfNotPresent || result) {
                    return result;
                } else {
                    return this.create(name, tags);
                }
            })
            .then(result => {
                this.logger.debug('Fetched LogGroup %s', '', result);
                return result;
            });
    }

    create(name, tags)
    {
        var params = {
                logGroupName: name,
                tags: tags
            };
        this.logger.info('Creating LogGroup %s...', params.logGroupName);
        this.logger.verbose('Creating LogGroup ...', params);
        return this._cloudwatchlogs.createLogGroup(params)
            .then(result => {
                return this.query(name);
            })
    }

    _getGroupTagsCombined(group)
    {
        this.logger.verbose('[_getGroupTagsCombined] ...', group);

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
        return this._cloudwatchlogs.listTagsLogGroup(params)
            .then(result => {
                return result.tags;
            });
    }

    queryAll(prefix, prevResults, next) {
        if (!prevResults) {
            prevResults = [];
        }
        var params = {
            logGroupNamePrefix: prefix,
            nextToken: next
        };
        return this._cloudwatchlogs.describeLogGroups(params)
            .then(result => {
                return Promise.serial(result.logGroups, x => this._getGroupTagsCombined(x))
                    .then(groups => {
                        prevResults = prevResults.concat(groups);
                        if (result.nextToken) {
                            return this.queryAll(prefix, prevResults, result.nextToken);
                        }
                        return prevResults;
                    });
            });
    }

    query(name) {
        var params = {
            logGroupNamePrefix: name
        };
        return this._cloudwatchlogs.describeLogGroups(params)
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
        this.logger.info('Deleting LogGroup %s...', name);
        return this._cloudwatchlogs.deleteLogGroup(params)
            .catch(reason => {
                this.logger.error(reason);
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
        this.logger.silly('Fetching Logs %s...', '', params);
        return this._cloudwatchlogs.getLogEvents(params)
            .then(data => {
                this.logger.silly('Fetching Logs Result. Count: %s...', data.events.length);

                var result = {
                    events: data.events
                };
                if (nextToken != data.nextForwardToken) {
                    result.nextToken = data.nextForwardToken;
                }
                return result;
            });
    }

    getStreams(groupName, nextToken, result)
    {
        if (!result) {
            result = [];
        }
        var params = {
            logGroupName: groupName,
            orderBy: 'LastEventTime',
            descending: true,
            nextToken: nextToken
        };
        this.logger.silly('Fetching Log Streams %s...', '', params);
        return this._cloudwatchlogs.describeLogStreams(params)
            .then(data => {
                this.logger.silly('Fetching Log Streams Result. Count: %s...', data.logStreams.length);
                for(var stream of data.logStreams) {
                    result.push(stream);
                }
                if (nextToken != data.nextForwardToken) {
                    return this.getStreams(groupName, data.nextToken, result);
                }
                return result;
            });
    }

    associateKmsKey(name, keyId) {
        var params = {
            logGroupName: name,
            kmsKeyId: keyId
        };
        this.logger.info('Associating Key %s with LogGroup %s...', keyId, name);
        return this._cloudwatchlogs.associateKmsKey(params);
    }

    disassociateKmsKey(name) {
        var params = {
            logGroupName: name
        };
        this.logger.info('Disassociating Key %s...', name);
        return this._cloudwatchlogs.disassociateKmsKey(params);
    }
}

module.exports = AWSCloudWatchClient;
