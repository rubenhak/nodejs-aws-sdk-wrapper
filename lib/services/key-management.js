const Promise = require('the-promise');
const _ = require('lodash');

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
                return Promise.serial(data.Keys, x => this._queryKeyTagsAndFilter(x.KeyId, tags))
            })
            .then(data => data.filter(x => x))
            .then(data => {
                return Promise.serial(data, x => this._queryKeyInfo(x.KeyId).then(info => {
                    info.Tags = x.Tags
                    return info
                }));
            })
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
                return {
                    KeyId: id,
                    Tags: myTags
                }
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
        this.logger.info('Creating Key...',);
        this.logger.verbose('Creating Key...', params);
        return this._kms.createKey(params)
            .then(result => {
                this.logger.verbose('Key Created:', result);
                var keyInfo = result.KeyMetadata;
                return keyInfo;
            });
    }

    scheduleKeyDeletion(id)
    {
        var params = {
            KeyId: id,
            PendingWindowInDays: 7
        };
        this.logger.info('Scheduling Key Deletion...',);
        this.logger.verbose('Scheduling Key Deletion...', params);
        return this._kms.scheduleKeyDeletion(params)
            .then(result => {
                this.logger.verbose('Key Scheduled to delete:', result);
            });
    }

    enableKey(id)
    {
        var params = {
            KeyId: id
        };
        this.logger.info('Enabling Key...',);
        this.logger.verbose('Enabling Key...', params);
        return this._kms.enableKey(params)
            .then(result => {
                this.logger.verbose('Enabled key:', result);
            });
    }

    disableKey(id)
    {
        var params = {
            KeyId: id
        };
        this.logger.info('Disabling Key...',);
        this.logger.verbose('Disabling Key...', params);
        return this._kms.disableKey(params)
            .then(result => {
                this.logger.verbose('Enabled key:', result);
            });
    }

    cancelKeyDeletion(id)
    {
        var params = {
            KeyId: id
        };
        this.logger.info('Canceling Key Deletion...',);
        this.logger.verbose('Canceling Key Deletion...', params);
        return this._kms.cancelKeyDeletion(params)
            .then(result => {
                this.logger.verbose('Key deletion canceled:', result);
            });
    }

    removeKeyTags(id, tagNames)
    {
        var params = {
            KeyId: id,
            TagKeys: tagNames
        };
        this.logger.info('Removing Key Tags...',);
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
        this.logger.verbose('Creating Key Alias...', params);
        return this._kms.createAlias(params)
            .then(result => {
                this.logger.verbose('Alias Created:', result);
                return params;
            });
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
}

module.exports = AWSKeyManagementClient;
