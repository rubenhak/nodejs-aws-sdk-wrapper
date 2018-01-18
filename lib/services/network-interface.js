const Promise = require('the-promise');
const _ = require('lodash');

class AWSNetworkInterfaceClient
{
    constructor(parent)
    {
        this._parent = parent;
        this._logger = parent._logger;
        this._ec2 = parent._ec2;
    }

    queryAll(cluster) {
        var params = {
            Filters: [
                {
                    Name: 'tag:berlioz:cluster',
                    Values: [ cluster ]
                }
            ]
        };
        return this._ec2.describeNetworkInterfaces(params).promise()
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
        return this._ec2.describeNetworkInterfaces(params).promise()
            .then(result => {
                var ni = null;
                if (result.NetworkInterfaces.length > 0) {
                    ni = this._massage(result.NetworkInterfaces)[0];
                }
                this._logger.verbose('NetworkInterface query result...%s', '', ni);
                return ni;
            });
    }

    create(cluster, service, id, subnetId, sgId)
    {
        var params = {
            Groups: [
                sgId
            ],
            SubnetId: subnetId
        };
        var niId = null;
        this._logger.info('Creating NetworkInterface %s-%s-%s...', cluster, service, id);
        this._logger.verbose('Creating NetworkInterface...%s', '', params);
        return this._ec2.createNetworkInterface(params).promise()
            .then(result => {
                var ni = result.NetworkInterface;
                niId = ni.NetworkInterfaceId;
                return ni;
            })
            .then(ni => {
                var tags = {
                    Name: cluster + '-' + service + '-' + id,
                    'berlioz:cluster': cluster,
                    'berlioz:service': service,
                    'berlioz:identity': id
                }
                return this._parent.Ec2utils.setTags(niId, ni.TagSet, tags);
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
        this._logger.info('Deleting NetworkInterface %s...', niId);
        return this._ec2.deleteNetworkInterface(params).promise()
            .then(result => {
                this._logger.verbose('NetworkInterface delete result:%s', '', result);
            });
    }

    attach(niId, instanceId, deviceIndex)
    {
        var params = {
            DeviceIndex: deviceIndex,
            InstanceId: instanceId,
            NetworkInterfaceId: niId
        };
        this._logger.info('Attaching NetworkInterface %s to %s :: %s...', niId, instanceId, deviceIndex);
        return this._ec2.attachNetworkInterface(params).promise()
            .then(result => {
                this._logger.verbose('NetworkInterface attach result:%s', '', result);
                return this.query(niId);
            })
            .then(newNi => this._waitAttachStabilize(newNi));
    }

    detach(ni)
    {
        var params = {
            AttachmentId: ni.Attachment.AttachmentId
        };
        this._logger.info('Detaching NetworkInterface %s from %s...', ni.Attachment.NetworkInterfaceId, ni.Attachment.InstanceId);
        return this._ec2.detachNetworkInterface(params).promise()
            .then(result => {
                this._logger.verbose('NetworkInterface detach result:%s', '', result);
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
        this._logger.verbose('Waiting NetworkInterface %s to stabilize. Now %s...', ni.NetworkInterfaceId, ni.Attachment.Status);
        return Promise.timeout(2000)
            .then(() => this.query(ni.NetworkInterfaceId))
            .then(newNi => this._waitAttachStabilize(newNi));
    }

}

module.exports = AWSNetworkInterfaceClient;
