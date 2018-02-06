const Promise = require('the-promise');
const _ = require('lodash');
const SSHClient = require('ssh2').Client;
const StringBuilder = require("string-builder");

class AWSVolumeClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._ec2 = parent.getAwsService('ec2');
    }

    query(id) {
        this.logger.silly('Volume query %s...', id);
        return this._ec2.describeVolumes({ VolumeIds: [ id ] }).promise()
            .then(data => {
                var volume = data.Volumes[0];
                this.logger.silly('Volume query result: %s', '', volume);
                return volume;
            });
    }

    queryAll(cluster, res, next) {
        if (!res) {
            res = [];
        }
        var params = {
            Filters: [
                {
                    Name: 'tag:berlioz:cluster',
                    Values: [ cluster ]
                }
            ],
            NextToken: next
        };
        return this._ec2.describeVolumes(params).promise()
            .then(result => {
                res = res.concat(result.Volumes);
                if (result.NextToken) {
                    return queryAll(cluster, res, result.NextToken);
                }
                return res;
            });
    }

    find(tags)
    {
        var params = {
            Filters: [ ]
        };

        for (var key of _.keys(tags)) {
            var val = tags[key];
            if (val) {
                val = val.toString();
            }
            params.Filters.push({
                Name: 'tag:' + key,
                Values: [ val ]
            });
        }

        return this._ec2.describeVolumes(params).promise()
            .then(data => {
                if (data.Volumes.length == 0) {
                    return null;
                }
                var volume = data.Volumes[0];
                return volume;
            });
    }

    create(params) {
        this.logger.info('Creating Volume...');
        this.logger.verbose('Creating Volume... %s', '', params);
        return this._ec2.createVolume(params).promise()
            .then(volume => {
                this.logger.verbose('Volume created %s', '', volume);
                return this._waitVolumeState(volume, ['available', 'in-use']);
            });
    }

    moveToZone(volume, zone) {
        if (!volume.AvailabilityZone)
        {
            throw new Error('Invalid Volume: ' + JSON.stringify(volume));
        }
        if (volume.Attachments.length > 0)
        {
            throw new Error('Volume is not detached: ' + JSON.stringify(volume, null, 2));
        }
        if (volume.AvailabilityZone === zone) {
            return Promise.resolve(volume);
        }

        var newVolume = null;
        return this.createSnapshot(volume.VolumeId)
            .then(snapshot => {
                var tags = volume.Tags.slice();
                this.parent.setTagArrayValue(tags, 'berlioz:sourceVolume', volume.VolumeId);
                this.parent.setTagArrayValue(tags, 'berlioz:sourceSnapshot', snapshot.SnapshotId);
                var params = {
                    SnapshotId: snapshot.SnapshotId,
                    AvailabilityZone: zone,
                    VolumeType: volume.VolumeType,
                    TagSpecifications: [{
                        ResourceType: "volume",
                        Tags: tags
                    }]
                };
                if (params.VolumeType === 'io1') {
                    params.Iops = volume.Iops;
                }
                return this.create(params);
            })
            .then(data => {
                newVolume = data;
                return this.performVolumeStuffCleanup(newVolume);
            })
            .then(() => {
                return this.query(newVolume.VolumeId);
            });
    }

    _waitVolumeState(volume, states) {
        this.logger.verbose('Volume %s is %s', volume.VolumeId, volume.State);
        if (states.includes(volume.State)) {
            return volume;
        }

        this.logger.verbose('Waiting volume %s state %s...', volume.VolumeId, states);
        return Promise.timeout(2000)
            .then(() => {
                return this.query(volume.VolumeId);
            })
            .then(newVolume => {
                return this._waitVolumeState(newVolume, states);
            });
    }

    _isStableStateAttachment(attachment)
    {
        return (attachment.State == 'attached') || (attachment.State == 'detached');
    }

    _waitVolumeAttachStabilize(volume) {
        for(var attachment of volume.Attachments) {
            this.logger.verbose('Volume %s :: %s is %s', volume.VolumeId, attachment.InstanceId, attachment.State);
        }

        if (_.every(volume.Attachments, x => this._isStableStateAttachment(x)))
        {
            return volume;
        }

        this.logger.verbose('Waiting volume %s attachment stabilize...', volume.VolumeId);
        return Promise.timeout(2000)
            .then(() => {
                return this.query(volume.VolumeId);
            })
            .then(newVolume => {
                return this._waitVolumeAttachStabilize(newVolume);
            });
    }

    createSnapshot(volumeId) {
        var params = {
            VolumeId: volumeId,
            Description: 'Temporary'
        }
        this.logger.info('Creating snapshot for %s...', volumeId);
        this.logger.verbose('Creating snapshot... %s', '', params);
        return this._ec2.createSnapshot(params).promise()
            .then(snapshot => {
                this.logger.verbose('Snapshot created %s', '', snapshot);
                return this._waitSnapshotReady(snapshot);
            });
    }

    _waitSnapshotReady(snapshot) {
        this.logger.verbose('Snapshot %s is %s', snapshot.SnapshotId, snapshot.State);
        if (snapshot.State === 'completed') {
            return snapshot;
        }

        this.logger.verbose('Waiting snapshot %s ready...', snapshot.SnapshotId);
        return Promise.timeout(5 * 1000)
            .then(() => {
                return this._ec2.describeSnapshots({ SnapshotIds: [ snapshot.SnapshotId ] }).promise();
            })
            .then(data => {
                var newSnapshot = data.Snapshots[0];
                return this._waitSnapshotReady(newSnapshot);
            });
    }

    deleteSnapshot(snapshotId)
    {
        var params = {
            SnapshotId: snapshotId
        }
        this.logger.info('Deleting snapshot %s...', snapshotId);
        return this._ec2.deleteSnapshot(params).promise()
            .catch(reason => {
                this.logger.error('Could not delete shapshot %s', snapshotId, reason);
            });
    }

    delete(volumeId)
    {
        var params = {
            VolumeId: volumeId
        }
        this.logger.info('Deleting volume %s...', volumeId);
        return this._ec2.deleteVolume(params).promise()
            .catch(reason => {
                this.logger.error('Could not delete volume %s', volumeId, reason);
            });
    }

    performVolumeStuffCleanup(volume) {
        return Promise.resolve()
            .then(() => {
                var snapshotId = this.parent.getObjectTag(volume, 'berlioz:sourceSnapshot');
                if (snapshotId) {
                    return this.deleteSnapshot(snapshotId);
                }
            })
            .then(() => {
                var volumeId = this.parent.getObjectTag(volume, 'berlioz:sourceVolume');
                if (volumeId) {
                    return this.delete(volumeId);
                }
            })
            .then(() => {
                return this.parent.Ec2utils.deleteTags(volume.VolumeId,
                                                        volume.Tags,
                                                        ['berlioz:sourceSnapshot',
                                                         'berlioz:sourceVolume']);
            });
    }

    attachAuto(volume, instance)
    {
        var currentDevices = {};
        for (var blockDevice of instance.BlockDeviceMappings)
        {
            var volumeId = blockDevice.Ebs.VolumeId;
            if (volumeId == volume.VolumeId) {
                return Promise.resolve(blockDevice.DeviceName);
            }
            currentDevices[blockDevice.DeviceName] = volumeId;
        }

        var deviceName = null;
        for(var i = "b".charCodeAt(0); i <= "z".charCodeAt(0); i++) {
            var dev = '/dev/sd' + String.fromCharCode(i);
            if (!(dev in currentDevices)) {
                deviceName = dev;
                break;
            }
        }

        if (!deviceName) {
            throw new Error('Could not allocate volume device name');
        }

        return this.attach(volume.VolumeId, instance.InstanceId, deviceName)
            .then(() => {
                return deviceName;
            });
    }

    attach(volumeId, instanceId, deviceName)
    {
        var params = {
            Device: deviceName,
            InstanceId: instanceId,
            VolumeId: volumeId
        }
        this.logger.info('Attaching volume %s to %s at %s...', volumeId, instanceId, deviceName);
        return this._ec2.attachVolume(params).promise()
            .then(result => {
                this.logger.info('Volume attach result %s', '', result);
                return;
            })
            .then(() => {
                return this.query(volumeId);
            })
            .then(newVolume => {
                return this._waitVolumeAttachStabilize(newVolume);
            });
    }

    detach(volume, instanceId)
    {
        if (volume.State == 'available') {
            return Promise.resolve(volume);
        }
        var params = {
            VolumeId: volume.VolumeId,
            InstanceId: instanceId
        }
        this.logger.info('Detaching volume %s...', volume.VolumeId);
        return this._ec2.detachVolume(params).promise()
            .then(result => {
                this.logger.info('Volume detach result %s', '', result);
                return result;
            })
            .then(() => {
                return this.query(volume.VolumeId);
            })
            .then(newVolume => {
                return this._waitVolumeAttachStabilize(newVolume);
            });
    }

    mountInstanceDataVolume(instance, drive, targetPath, sshPemKey) {
        this.logger.info('Mounting %s to %s on %s...', drive, targetPath, instance.InstanceId)
        var vdrive = drive.replace('/dev/sd', '/dev/xvd');
        var script = new StringBuilder();
        script.appendLine('lsblk');
        script.appendLine('DISC_TYPE=`sudo file -s ' + vdrive + '`');
        script.appendLine('echo "DISC_TYPE=$DISC_TYPE"');
        script.appendLine('if [ "$DISC_TYPE" = "' + vdrive + ': data" ]');
        script.appendLine('then');
        script.appendLine('    echo "unformatted"');
        script.appendLine('    sudo mkfs -t ext4 ' + vdrive);
        script.appendLine('fi');
        script.appendLine('sudo mkdir -p ' + targetPath);
        script.appendLine('if grep "' + vdrive + '" /etc/fstab; then');
        script.appendLine('    echo "Found entry in fstab"');
        script.appendLine('else');
        script.appendLine('    echo "DID NOT FIND entry in fstab"');
        script.appendLine('    sudo bash -c \'echo "' + vdrive + ' ' + targetPath + ' ext4 defaults,nofail 0 2" >> /etc/fstab\'');
        script.appendLine('fi');
        script.appendLine('sudo mount -a');
        script.appendLine('ls -la ' + targetPath);
        script.appendLine('exit');
        script.appendLine();
        // process.exit(111);
        return this._executeInstanceScript(instance, script, sshPemKey);
    }

    unmountInstanceDataVolume(instance, drive, sshPemKey) {
        this.logger.info('Unmounting %s on %s...', drive, instance.InstanceId)
        var vdrive = drive.replace('/dev/sd', '/dev/xvd');
        var script = new StringBuilder();
        script.appendLine('drive="' + vdrive + '"');
        script.appendLine('regex="${drive}[[:blank:]]+(\\S+)"');
        script.appendLine('echo "REGEX=$regex"');
        script.appendLine('if [[ $(cat /etc/fstab) =~ $regex ]]');
        script.appendLine('then');
        script.appendLine('    mountPoint="${BASH_REMATCH[1]}"');
        script.appendLine('    echo "${drive} => ${mountPoint}" ');
        script.appendLine('    echo "Unmounting ${mountPoint}..."');
        script.appendLine('    sudo umount -f ${mountPoint}');
        script.appendLine('    echo "Removing from fstab ${mountPoint}..."');
        script.appendLine('    sudo sed -i "/${drive//\//\\/}/d" /etc/fstab');
        script.appendLine('else');
        script.appendLine('    echo "${drive} not present. exiting."');
        script.appendLine('fi');
        script.appendLine('exit');
        script.appendLine();
        return this._executeInstanceScript(instance, script, sshPemKey);
    }

    _executeInstanceScript(instance, script, sshPemKey) {
        this.logger.info('_executeInstanceScript:');
        this.logger.info(script.toString());

        return new Promise((resolve, reject) => {
            var conn = new SSHClient();
            conn
              .on('ready', () => {
                this.logger.info('Client :: ready');
                conn.shell((err, stream) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    stream.on('close', () => {
                        this.logger.info('Stream :: close');
                        conn.end();
                        resolve();
                    }).on('data', (data) => {
                        this.logger.info('STDOUT: ' + data);
                    }).stderr.on('data', (data) => {
                        this.logger.info('STDERR: ' + data);
                    });
                    stream.end(script.toString());
                });
            })
            .on('error', err => {
                this.logger.error('ERROR WITH SSH: ', err);
                this.logger.exception(err);
                reject(err);
            })
            .connect({
                host: instance.PublicIpAddress,
                port: 22,
                username: 'ec2-user',
                privateKey: sshPemKey
            });

        });
    }
}

module.exports = AWSVolumeClient;
