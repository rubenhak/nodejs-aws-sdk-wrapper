const Promise = require('the-promise');
const _ = require('lodash');

class AWSNetworkInterfaceClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._ec2 = parent.getAwsService('ec2');
    }

    queryAll(tags) {
        var params = {
            Filters: _.keys(tags).map(x => ({
                Name: 'tag:' + x,
                Values: [ tags[x] ]
            }))
        };
        return this._ec2.describeNetworkInterfaces(params)
            .then(result => {
                return this._massage(result.NetworkInterfaces);
            });
    }

    query(id) {
        var params = {
            NetworkInterfaceIds: [
                id
            ]
        };
        return this._ec2.describeNetworkInterfaces(params)
            .then(result => {
                var ni = null;
                if (result.NetworkInterfaces.length > 0) {
                    ni = this._massage(result.NetworkInterfaces)[0];
                }
                this.logger.verbose('NetworkInterface query result...%s', '', ni);
                return ni;
            });
    }

    create(subnetId, sgId, tags)
    {
        var params = {
            Groups: [
                sgId
            ],
            SubnetId: subnetId
        };
        var niId = null;
        this.logger.info('Creating NetworkInterface...');
        this.logger.verbose('Creating NetworkInterface...%s', '', params);
        return this._ec2.createNetworkInterface(params)
            .then(result => {
                var ni = result.NetworkInterface;
                niId = ni.NetworkInterfaceId;
                return ni;
            })
            .then(ni => {
                return this.parent.Ec2utils.setTags(niId, ni.TagSet, tags);
            })
            .then(() => {
                return this.query(niId);
            });
    }

    _massage(interfaces)
    {
        for(var x of interfaces) {
            x.Tags = x.TagSet;
        }
        return interfaces;
    }

    delete(niId)
    {
        var params = {
            NetworkInterfaceId: niId
        };
        this.logger.info('Deleting NetworkInterface %s...', niId);
        return this._ec2.deleteNetworkInterface(params)
            .then(result => {
                this.logger.verbose('NetworkInterface delete result:%s', '', result);
            });
    }

    attach(niId, instanceId, deviceIndex)
    {
        var params = {
            DeviceIndex: deviceIndex,
            InstanceId: instanceId,
            NetworkInterfaceId: niId
        };
        this.logger.info('Attaching NetworkInterface %s to %s at index %s...', niId, instanceId, deviceIndex);
        return this._ec2.attachNetworkInterface(params)
            .then(result => {
                this.logger.verbose('NetworkInterface attach result:%s', '', result);
                return this.query(niId);
            })
            .then(newNi => this._waitAttachStabilize(newNi));
    }

    detach(ni)
    {
        var params = {
            AttachmentId: ni.Attachment.AttachmentId
        };
        this.logger.info('Detaching NetworkInterface %s from %s...', ni.NetworkInterfaceId, ni.Attachment.InstanceId);
        return this._ec2.detachNetworkInterface(params)
            .then(result => {
                this.logger.verbose('NetworkInterface detach result:%s', '', result);
                return this.query(ni.NetworkInterfaceId);
            })
            .then(newNi => this._waitAttachStabilize(newNi));
    }

    _waitAttachStabilize(ni)
    {
        if (!ni.Attachment) {
            return ni;
        }
        if (ni.Attachment.Status == 'attached' || ni.Attachment.Status == 'detached') {
            return ni;
        }
        this.logger.verbose('Waiting NetworkInterface %s to stabilize. Now %s...', ni.NetworkInterfaceId, ni.Attachment.Status);
        return Promise.timeout(5000)
            .then(() => this.query(ni.NetworkInterfaceId))
            .then(newNi => this._waitAttachStabilize(newNi));
    }

}

module.exports = AWSNetworkInterfaceClient;
