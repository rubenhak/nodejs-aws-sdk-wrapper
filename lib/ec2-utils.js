const _ = require('the-lodash');

class AWSEc2Utils
{
    constructor(parent)
    {
        this._parent = parent;
        this._logger = parent._logger;
        this._ec2 = parent.getAwsService('ec2');
    }

    setupTags(resource, currentTags, newTags)
    {
        var tagsToDelete = [];
        var tagsToCreate = [];

        for(var x of _.keys(currentTags))
        {
            if (!(x in newTags)) {
                tagsToDelete.push({
                    Key: x
                });
            }
        }

        for(var x of _.keys(newTags))
        {
            if (newTags[x] != currentTags[x]) {
                tagsToCreate.push({
                    Key: x,
                    Value: newTags[x].toString()
                });
            }
        }

        return Promise.resolve()
            .then(() => {
                if (tagsToDelete.length > 0) {
                    var params = {
                        Resources: [
                            resource
                        ],
                        Tags: tagsToDelete
                    };
                    this._logger.verbose('Deleting tags... %s', '', params);
                    this._logger.info('Deleting tags for %s ...', resource);
                    return this._ec2.deleteTags(params);
                }
            })
            .then(() => {
                if (tagsToCreate.length > 0) {
                    var params = {
                        Resources: [
                            resource
                        ],
                        Tags: tagsToCreate
                    };
                    this._logger.info('Creating tags for %s ...', resource);
                    this._logger.verbose('Creating tags... %s', '', params);
                    return this._ec2.createTags(params);
                }
            })
    }

    setTags(resource, origTagsArray, newTags)
    {
        var origTags = {};
        for (var x of origTagsArray) {
            origTags[x.Key] = x.Value;
        }

        var tagArray = [];
        for (var key of _.keys(newTags)) {
            if (origTags[key] != newTags[key]) {
                tagArray.push({
                    Key: key,
                    Value: newTags[key].toString()
                });
            }
        }

        if (tagArray.length == 0) {
            return Promise.resolve();
        }

        var params = {
            Resources: [
                resource
            ],
            Tags: tagArray
        };
        this._logger.info('Creating tags for %s ...', resource);
        this._logger.verbose('Creating tags... %s', '', params);
        return this._ec2.createTags(params)
            .then(result => {
                this._logger.verbose('Tags created.%s', '', result);
            });
    }

    deleteTags(resource, origTagsArray, tagsToDelete)
    {
        var origTags = {};
        for (var x of origTagsArray) {
            origTags[x.Key] = x.Value;
        }

        var tagArray = [];
        for (var key of tagsToDelete) {
            if (key in origTags) {
                tagArray.push({
                    Key: key
                });
            }
        }

        if (tagArray.length == 0) {
            return Promise.resolve();
        }

        var params = {
            Resources: [
                resource
            ],
            Tags: tagArray
        };
        this._logger.verbose('Deleting tags... %s', '', params);
        this._logger.info('Deleting tags for %s ...', resource);
        return this._ec2.deleteTags(params)
            .then(result => {
                this._logger.verbose('Tags deleted.%s', '', result);
            });
    }
}

module.exports = AWSEc2Utils;
