const Promise = require('the-promise');
const _ = require('lodash');
const SSHClient = require('ssh2').Client;

class AWSInstanceClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._ec2 = parent.getAwsService('ec2');
    }

    queryAll(cluster, nextToken, results)
    {
        if (!results) {
            results = [];
        }
        var params = {
            Filters: [
                {
                    Name: 'tag:berlioz:cluster',
                    Values: [ cluster ]
                }
            ]
        }
        if (nextToken) {
            params.NextToken = nextToken;
        }
        return this._ec2.describeInstances(params).promise()
            .then(data => {
                for (var reservation of data.Reservations) {
                    for (var instance of reservation.Instances) {
                        if (instance.State.Name != 'terminated') {
                            results.push(instance);
                        }
                    }
                }
                if (data.NextToken) {
                    return Promise.resolve(this.queryAll(cluster, data.NextToken, results));
                } else {
                    return results;
                }
            });
    }

    query(id) {
        return this._ec2.describeInstances({ InstanceIds: [ id ] }).promise()
            .then(data => {
                var instance = data.Reservations[0].Instances[0];
                return instance;
            });
    }

    run(config, waitStabilize)
    {
        var tags = {};
        tags['Name'] = config.clusterName;
        tags['berlioz:cluster'] = config.clusterName;

        var params = {
            MinCount: 1,
            MaxCount: 1,
            TagSpecifications: [
                {
                    ResourceType: 'instance',
                    Tags: _.keys(tags).map(x => ({ Key: x, Value: tags[x]}))
                }
            ]
        }
        params.ImageId = config.imageId;
        params.InstanceType = config.instanceType;
        params.Placement = {
                AvailabilityZone: config.zone
            };
        params.KeyName = config.keyName;
        params.NetworkInterfaces = [
                {
                    DeviceIndex: 0,
                    AssociatePublicIpAddress: true,
                    SubnetId: config.subnetId,
                    Groups: [ config.securityGroupId ]
                }
            ];
        params.IamInstanceProfile = {
                Name: config.iamInstanceProfile
            };
        params.UserData = new Buffer(config.userData).toString('base64');

        this.logger.info('Creating Instance...%s', '', params);
        return this._ec2.runInstances(params).promise()
            .then(data => {
                this.logger.info('Run Instance Result%s', '', data);
                var instance = data.Instances[0];
                return instance;
            })
            .then(instance => {
                if (waitStabilize) {
                    return this.waitInstanceStable(instance.InstanceId, instance)
                }
                return instance;
            });
    }

    terminate(instanceId)
    {
        var params = {
            InstanceIds: [
                instanceId
            ]
        }

        this.logger.info('Terminating Instance %s...', instanceId);
        return this._ec2.terminateInstances(params).promise()
            .then(data => {
                this.logger.info('Terminating Instance Result%s', '', data);
                // var instance = data.Instances[0];
                // return instance;
            })
            .then(() => this.query(instanceId))
            .then(instance => this.waitInstanceStable(instanceId, instance));
    }

    waitInstanceStable(instanceId, instance)
    {
        if (this._isInstanceStable(instance)) {
            this.logger.info('Instance %s is stable', instanceId);
            return instance;
        }

        this.logger.info('Waiting Instance %s to be stable...', instanceId);
        return Promise.timeout(5000)
            .then(() => this.query(instanceId))
            .then(newInstance => this.waitInstanceStable(instanceId, newInstance));
    }

    _isInstanceStable(instance)
    {
        if (!instance) {
            return true;
        }

        if (instance.State.Name == 'pending' || instance.State.Name == 'shutting-down' || instance.State.Name == 'stopping')
        {
            return false;
        }

        if (instance.State.Name == 'terminated' || instance.State.Name == 'stopped')
        {
            return true;
        }

        if (instance.BlockDeviceMappings.length == 0) {
            return false;
        }

        for(var volume of instance.BlockDeviceMappings) {
            if (volume.Ebs.Status == 'attaching') {
                return false;
            }
        }

        for(var ni of instance.NetworkInterfaces) {
            if (ni.Attachment.Status == 'attaching') {
                return false;
            }
        }

        return true;
    }

    fixECSNetworking(instance, sshPemKey)
    {
        this.logger.info('Fixing Instance ECS Networking on %s...', instance.InstanceId)

        // if ! grep -q "172.17.0.0/16 via 172.17.0.1 dev docker0 table ${RTABLE}" /etc/sysconfig/network-scripts/ec2net-functions; then
        //   echo 'STRING NOT FOUND'
        //   sed -i -e ':a;N;$!ba;s/cat <<- EOF > ${route_file}.*EOF/cat <<- EOF > ${route_file}\n\tdefault via ${gateway} dev ${INTERFACE} table ${RTABLE}\n\tdefault via ${gateway} dev ${INTERFACE} metric ${RTABLE}\n\t${cidr} dev ${INTERFACE} proto kernel scope link src ${primary_ipv4} table ${RTABLE}\n\t172.17.0.0\/16 via 172.17.0.1 dev docker0 table ${RTABLE}\nEOF/g' ec2net-functions
        // else
        // fi

        var filePath = '/etc/sysconfig/network-scripts/ec2net-functions';
        var newRoute = '172.17.0.0/16 via 172.17.0.1 dev docker0 table ${RTABLE}';

        var header = 'cat <<- EOF > ${route_file}';
        var footer = 'EOF';
        var inside = [
            'default via ${gateway} dev ${INTERFACE} table ${RTABLE}'
            'default via ${gateway} dev ${INTERFACE} metric ${RTABLE}'
            '${cidr} dev ${INTERFACE} proto kernel scope link src ${primary_ipv4} table ${RTABLE}'
            newRoute
        ];

        var searchCriteria = header + '.*' + footer;
        var replaceString = header + '\\n' + inside.map(x => '\\t' + _.replace(x, '/', '\\/') + '\\n').join('') + footer;
        return this.sshExecute(instance, sshPemKey)
            .cmd('if ! grep -q "' + newRoute + '" ' + filePath + '; then')
            .cmd('  echo MULTI-INTERFACE PATCH NEEDED')
            .cmd('  sed -i -e \':a;N;$!ba;s/' + searchCriteria + '/' + replaceString + '/g\' ' + filePath)
            .cmd('else')
            .cmd('  echo MULTI-INTERFACE PATCH IN PLACE')
            .cmd('exit')
            .go();
    }

    sshExecute(instance, sshPemKey)
    {
        var script = '';
        var context = {
            cmd : (v) => {
                var lines = [];
                if (_.isArray(v))
                {
                    for(var x of v)
                    {
                        for(var line of _.split(x, '\r\n'))
                        {
                            lines.push(line);
                        }
                    }
                }
                else
                {
                    for(var line of _.split(v, '\r\n'))
                    {
                        lines.push(line);
                    }
                }
                for(var line of lines)
                {
                    script += line + '\n';
                }
                return context;
            },
            go: () => {
                return this.executeInShell(instance, script, sshPemKey)
            }
        };
        return context;
    }

    executeInShell(instance, script, sshPemKey) {
        this.logger.info('executeInShell %s, ip: %s.', instance.InstanceId, instance.PublicIpAddress, script);

        var logger = this.logger.sublogger(instance.InstanceId);

        var currentSessionBuffer = '';
        var outputData = [];

        return new Promise((resolve, reject) => {
            var conn = new SSHClient();
            conn
              .on('ready', () => {
                logger.info('SSH Client :: ready');
                conn.shell((err, stream) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    stream.on('close', (code, signal) => {
                        if (currentSessionBuffer.length > 0) {
                            logger.info(currentSessionBuffer);
                            outputData.push(currentSessionBuffer);
                            currentSessionBuffer = '';
                        }
                        logger.info('SSH Client Stream Close. Code: %s. Signal: %s', code, signal);
                        this.logger.info('SSH Client Stream :: close');
                        conn.end();
                        resolve(outputData);
                    }).on('data', (data) => {
                        var textChunk = data.toString();
                        for (var i = 0; i < textChunk.length; i++) {
                            var ch = textChunk.charAt(i)
                            if (ch == '\n') {
                                if (currentSessionBuffer.length > 0) {
                                    logger.info(currentSessionBuffer);
                                    outputData.push(currentSessionBuffer);
                                    currentSessionBuffer = '';
                                } else {
                                    logger.info('');
                                }
                            }
                            else if (ch == '\r') {
                            }
                            else {
                                currentSessionBuffer += ch;
                            }
                        }
                    })
                    .stderr.on('data', (data) => {
                        logger.info('STDERR: ' + data);
                        this.logger.info('SSH Client Stream Error: ' + data);
                    });
                    stream.end(script);
                });
            })
            .on('error', err => {
                logger.error('ERROR WITH SSH: ', err);
                logger.exception(err);
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

module.exports = AWSInstanceClient;
