const _ = require('lodash');

class AWSEc2Utils
{
    constructor(parent)
    {
        this._parent = parent;
        this._logger = parent._logger;
        this._ec2 = parent._ec2;
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
        return this._ec2.createTags(params).promise()
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
        return this._ec2.deleteTags(params).promise()
            .then(result => {
                this._logger.verbose('Tags deleted.%s', '', result);
            });
    }
}

module.exports = AWSEc2Utils;