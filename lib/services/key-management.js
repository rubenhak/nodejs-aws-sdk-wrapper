const Promise = require('the-promise');
const _ = require('the-lodash');

class AWSKeyManagementClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._kms = parent.getAwsService('kms');
    }

    queryAllKeys(tags, nextToken, results)
    {
        if (!results) {
            results = [];
        }
        var params = {};
        if (nextToken) {
            params.Marker = nextToken;
        }
        return this._kms.listKeys(params)
            .then(data => {
                return Promise.serial(data.Keys, x => this._queryKeyInfo(x.KeyId))
            })
            .then(data => {
                return _.filter(data, x => x.KeyManager == 'CUSTOMER');
            })
            .then(data => {
                return Promise.serial(data, keyObj => {
                    return this._queryKeyTagsAndFilter(keyObj.KeyId, tags)
                        .then(myTags => {
                            if (!myTags) {
                                return null;
                            }
                            keyObj.Tags = myTags;
                            return keyObj;
                        });
                })
            })
            .then(data => data.filter(x => x))
            .then(data => {
                for (var obj of data) {
                    results.push(obj);
                }
                if (data.NextMarker) {
                    return Promise.resolve(this.queryAllKeys(tags, data.NextMarker, results));
                } else {
                    return results;
                }
            });
    }

    queryKey(id)
    {
        var params = {
            KeyId: id
        }
        var obj = null;
        return this._kms.describeKey(params)
            .then(data => {
                obj = data.KeyMetadata;
                return this._queryKeyTags(id)
            })
            .then(data => {
                obj.Tags = data;
                return obj;
            })
    }

    _queryKeyTagsAndFilter(id, tags)
    {
        return this._queryKeyTags(id)
            .then(myTags => {
                if (tags) {
                    for(var tag in tags) {
                        if (myTags[tag] != tags[tag]) {
                            return null
                        }
                    }
                }
                return myTags;
            })
    }

    _queryKeyTags(id)
    {
        var params = {
            KeyId: id
        };
        return this._kms.listResourceTags(params)
            .then(data => {
                var tags = {}
                for (var tagInfo of data.Tags) {
                    tags[tagInfo.TagKey] = tagInfo.TagValue
                }
                return tags;
            });
    }

    _queryKeyInfo(id)
    {
        var params = {
            KeyId: id
        };
        return this._kms.describeKey(params)
            .then(data => {
                return data.KeyMetadata
            });
    }

    createKey(config, tags)
    {
        var params;
        if (config) {
            params = _.clone(config)
        } else {
            params = {}
        }
        if (!params.Tags) {
            params.Tags = []
        }
        if (tags) {
            for(var tag in tags) {
                params.Tags.push({
                    TagKey: tag,
                    TagValue: tags[tag]
                })
            }
        }
        this.logger.info('Creating Key...');
        this.logger.verbose('Creating Key...', params);
        return this._kms.createKey(params)
            .then(result => {
                this.logger.verbose('Key Created:', result);
                var keyInfo = result.KeyMetadata;
                return this.queryKey(keyInfo.KeyId);
            });
    }

    scheduleKeyDeletion(id)
    {
        var params = {
            KeyId: id,
            PendingWindowInDays: 7
        };
        this.logger.info('Scheduling Key Deletion %s...', id);
        this.logger.verbose('Scheduling Key Deletion...', params);
        return this._kms.scheduleKeyDeletion(params)
            .then(result => {
                this.logger.verbose('Key Scheduled to delete:', result);
            })
            .then(() => this._waitKey(id, ['PendingDeletion']));
            ;
    }

    enableKey(id)
    {
        var params = {
            KeyId: id
        };
        this.logger.info('Enabling Key %s...', id);
        this.logger.verbose('Enabling Key...', params);
        return this._kms.enableKey(params)
            .then(result => {
                this.logger.verbose('Enabled key:', result);
            })
            .then(() => this._waitKey(id, ['Enabled', 'PendingDeletion']));
    }

    disableKey(id)
    {
        var params = {
            KeyId: id
        };
        this.logger.info('Disabling Key %s...', id);
        this.logger.verbose('Disabling Key...', params);
        return this._kms.disableKey(params)
            .then(result => {
                this.logger.verbose('Enabled key:', result);
            })
            .then(() => this._waitKey(id, ['Disabled', 'PendingDeletion']));
            ;
    }

    cancelKeyDeletion(id)
    {
        var params = {
            KeyId: id
        };
        this.logger.info('Canceling Key Deletion %s...', id);
        this.logger.verbose('Canceling Key Deletion...', params);
        return this._kms.cancelKeyDeletion(params)
            .then(result => {
                this.logger.verbose('Key deletion canceled:', result);
            })
            .then(() => this._waitKey(id, ['Enabled', 'Disabled']));
            ;
    }

    removeKeyTags(id, tagNames)
    {
        var params = {
            KeyId: id,
            TagKeys: tagNames
        };
        this.logger.info('Removing Key Tags %s...', id);
        this.logger.verbose('Removing Key Tags...', params);
        return this._kms.untagResource(params)
            .then(result => {
                this.logger.verbose('Tags Removed:', result);
            });
    }
    
    queryAllAliases(prefix, nextToken, results)
    {
        if (!results) {
            results = []
        }
        var params = {};
        if (nextToken) {
            params.Marker = nextToken;
        }
        return this._kms.listAliases(params)
            .then(data => {
                for (var obj of data.Aliases) {
                    if (prefix) {
                        if (!_.startsWith(obj.AliasName, 'alias/' + prefix))
                        {
                            continue
                        }
                    }
                    results.push(obj);
                }
                if (data.NextMarker) {
                    return Promise.resolve(this.queryAllAliases(prefix, data.NextMarker, results));
                } else {
                    return results;
                }
            });
    }

    createAlias(name, keyId)
    {
        var params = {
            AliasName: name,
            TargetKeyId: keyId
        };
        this.logger.info('Creating Key Alias %s...', name);
        return Promise.retry(() => {
            this.logger.verbose('Creating Key Alias. Trying...', params);
            return this._kms.createAlias(params)
                .then(result => {
                    this.logger.verbose('Alias Created:', result);
                    return params;
                });
        }, 3, 5000);
    }

    deleteAlias(name)
    {
        var params = {
            AliasName: name
        };
        this.logger.info('Deleting Key Alias %s...', name);
        this.logger.verbose('Deleting Key Alias...', params);
        return this._kms.deleteAlias(params)
            .then(result => {
                this.logger.verbose('Alias Deleted:', result);
                return result
            });
    }

    _waitKey(id, statesToWait) 
    {
        this.logger.verbose('Waiting Key %s to %s...', id, statesToWait);
        return Promise.timeout(2000)
            .then(() => this.queryKey(id))
            .then(keyObj => {
                if (!keyObj) {
                    return;
                }
                for(var x of statesToWait) {
                    if (keyObj.KeyState == x) {
                        this.logger.verbose('Key %s is ready: %s.', id, keyObj.KeyState);
                        return keyObj;
                    }
                }
                return this._waitKey(id, statesToWait);
            });
    }
}

module.exports = AWSKeyManagementClient;
