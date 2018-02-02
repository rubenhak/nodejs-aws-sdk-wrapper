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

    setup(name)
    {
        return this._create(name)
            .catch(error => {
                if (error.code == 'InvalidKeyPair.Duplicate') {
                    return this._delete(name)
                        .then(() => this._create(name));
                } else {
                    throw error;
                }
            })
            .then(data => {
                return data;
            });
    }

    _create(name)
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

    _delete(name)
    {
        var params = {
            KeyName: name
        }
        this.logger.info('Deleting KeyPair...%s', name);
        return this._ec2.deleteKeyPair(params).promise()
            .then(data => {
                this.logger.info('KeyPair deleted: %s', data.KeyName);
                return data;
            });
    }
}

module.exports = AWSSecurityClient;
