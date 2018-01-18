const Promise = require('the-promise');
const _ = require('lodash');

class AWSContainerInstanceClient
{
    constructor(parent)
    {
        this._parent = parent;
        this._logger = parent._logger;
        this._ecs = parent._ecs;
    }

    query(clusterName, arn) {
        return this._ecs.describeContainerInstances({ cluster: clusterName, containerInstances: [arn] }).promise()
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
        return this._ecs.listContainerInstances(params).promise()
            .then(result => {
                if (result.containerInstanceArns.length > 0) {
                    return result.containerInstanceArns[0];
                }
                return null;
            });
    }

    queryAll(clusterName) {
        return Promise.resolve()
            .then(data => {
                return new Promise((resolve, reject) => {
                    var result = [];
                    this._queryIdsX(resolve, reject, result, clusterName, null);
                });
            })
            .then(ids => {
                return Promise.serial(ids, x => {
                        return this.query(clusterName, x);
                    });
            });
    }

    _queryIdsX(resolve, reject, result, clusterName, next) {
        this._ecs.listContainerInstances({
            cluster: clusterName,
            nextToken: next
         }).promise()
            .then(data => {
                result = result.concat(data.containerInstanceArns);
                if (data.nextToken) {
                    this._queryIdsX(resolve, reject, result, clusterName, data.nextToken);
                } else {
                    resolve(result);
                }
            })
            .catch(error => {
                resolve(result);
            });
    }
}

module.exports = AWSContainerInstanceClient;