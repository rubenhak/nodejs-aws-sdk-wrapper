const Promise = require('the-promise');
const _ = require('the-lodash');

class AWSContainerInstanceClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._ecs = parent.getAwsService('ecs');
    }

    query(clusterName, arn) {
        return this._ecs.describeContainerInstances({ cluster: clusterName, containerInstances: [arn] })
            .then(data => {
                var ci = data.containerInstances[0];
                return ci;
            })
    }

    identifyFromInstanceId(clusterName, instanceId)
    {
        var params = {
            cluster: clusterName,
            filter: 'ec2InstanceId == ' + instanceId
        }
        return this._ecs.listContainerInstances(params)
            .then(result => {
                if (result.containerInstanceArns.length > 0) {
                    return result.containerInstanceArns[0];
                }
                return null;
            });
    }

    queryAll(clusterNamePrefix) {
        return Promise.resolve()
            .then(() => this.parent.Cluster.queryNames(clusterNamePrefix))
            .then(clusterNames => {
                return Promise.serial(clusterNames, x => this.queryAllForCluster(x))
            })
            .then(results => _.flattenDeep(results));
    }

    queryAllForCluster(clusterName, nextToken, results)
    {
        if (!results) {
            results = []
        }
        var params = {
            cluster: clusterName
        }
        if (nextToken) {
            params.nextToken = nextToken
        }
        return this._ecs.listContainerInstances(params)
            .then(data => Promise.serial(data.containerInstanceArns, x => this.query(clusterName, x)))
            .then(data => {
                results = results.concat(data);
                if (data.nextToken) {
                    return this.queryAllForCluster(clusterName, data.nextToken, results);
                } else {
                    return results;
                }
            })
            .catch(reason => {
                if (reason.code == 'ClusterNotFoundException') {
                    return results;
                } else {
                    throw reason;
                }
            });
    }
}

module.exports = AWSContainerInstanceClient;
