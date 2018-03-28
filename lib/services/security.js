const Promise = require('the-promise');
const _ = require('lodash');

class AWSSecurityClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._ec2 = parent.getAwsService('ec2');
    }

    queryAllKeyPairs(prefix)
    {
        var params = {
        }
        this.logger.verbose('Querying KeyPairs...');
        return this._ec2.describeKeyPairs(params).promise()
            .then(data => {
                this.logger.silly('Query KeyPairs result: ', data);
                var result = data.KeyPairs;
                result = result.filter(x => _.startsWith(x.KeyName, prefix));
                return result;
            });
    }

    queryKeyPair(name)
    {
        var params = {
            KeyNames: [name]
        }
        this.logger.verbose('Querying KeyPair %s...', name);
        return this._ec2.describeKeyPairs(params).promise()
            .then(data => {
                this.logger.silly('Query KeyPair result: ', data);
                if (data.KeyPairs.length == 0) {
                    return null;
                } else {
                    return data.KeyPairs[0];
                }
            });
    }

    setupKeyPair(name)
    {
        return this._createKeyPair(name)
            .catch(error => {
                if (error.code == 'InvalidKeyPair.Duplicate') {
                    return this._deleteKeyPair(name)
                        .then(() => this._createKeyPair(name));
                } else {
                    throw error;
                }
            })
            .then(data => {
                return data;
            });
    }

    _createKeyPair(name)
    {
        var params = {
            KeyName: name
        }
        this.logger.info('Creating KeyPair...%s', name);
        return this._ec2.createKeyPair(params).promise()
            .then(data => {
                this.logger.info('KeyPair created: %s', data.KeyName);
                return data;
            });
    }

    _deleteKeyPair(name)
    {
        var params = {
            KeyName: name
        }
        this.logger.info('Deleting KeyPair %s...', name);
        return this._ec2.deleteKeyPair(params).promise()
            .then(data => {
                this.logger.info('KeyPair deleted: %s', name);
                return data;
            });
    }
}

module.exports = AWSSecurityClient;
