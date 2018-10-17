const Promise = require('the-promise');
const _ = require('the-lodash');

class AWSDynamoClient
{
    constructor(parent)
    {
        this.parent = parent;
        this.logger = parent.logger;
        this._dynamoDb = parent.getAwsService('dynamodb');
    }

    create(name, config)
    {
        return Promise.resolve()
            .then(() => this.query(name))
            .then(table => {
                if (table) {
                    return table;
                } else {
                    return this._create(name, config)
                }
            })
            .then(table => {
                this.logger.verbose('DynamoDB Table %s Final Create Result: ', name, table);
                return table;
            })
    }

    _create(name, config)
    {
        var params = _.clone(config);
        params.TableName = name;
        if (!params.ProvisionedThroughput) {
            params.ProvisionedThroughput = {}
        }
        if (!params.ProvisionedThroughput.WriteCapacityUnits) {
            params.ProvisionedThroughput.WriteCapacityUnits = 1;
        }
        if (!params.ProvisionedThroughput.ReadCapacityUnits) {
            params.ProvisionedThroughput.ReadCapacityUnits = 1;
        }
        this.logger.info('Creating DynamoDB Table %s...', name);
        this.logger.verbose('Creating DynamoDB Table...', params);
        return this._dynamoDb.createTable(params)
            .then(result => {
                this.logger.verbose('DynamoDB Table %s Create Result: ', name, result);
                return this._waitReady(result.TableDescription);
            });
    }

    update(name, config)
    {
        var params;
        if (config) {
            params = _.clone(config);
        } else {
            params = {}
        }
        params.TableName = name;
        this.logger.info('Updating DynamoDB Table %s...', name);
        this.logger.verbose('Updating DynamoDB Table...', params);
        return this._dynamoDb.updateTable(params)
            .then(result => {
                this.logger.verbose('DynamoDB Table %s Update Result: ', name, result);
                return this._waitReady(result.TableDescription);
            });
    }

    delete(name)
    {
        var params = {
            TableName: name
        }
        this.logger.info('Deleting DynamoDB Table %s...', name);
        return this._dynamoDb.deleteTable(params)
            .catch(reason => {
                if (reason.code == 'ResourceNotFoundException') {
                    return null;
                } else {
                    throw reason;
                }
            })
            .then(result => {
                var table = null;
                if (result) {
                    table = result.TableDescription;
                }
                this.logger.verbose('DynamoDB Table %s Delete Result: ', name, table);
                return this._waitReady(table);
            });
    }

    query(name) {
        var params = {
            TableName: name
        };
        this.logger.verbose('Querying DynamoDB Table %s...', name);
        return this._dynamoDb.describeTable(params)
            .catch(reason => {
                if (reason.code == 'ResourceNotFoundException') {
                    return null;
                } else {
                    throw reason;
                }
            })
            .then(result => {
                var table = null;
                if (result) {
                    table = result.Table;
                }
                this.logger.silly('DynamoDB Table %s Query Result: ', name, table);
                return this._waitReady(table);
            });
    }

    queryAll(prefix, lastTableName, results)
    {
        if (!results) {
            results = [];
        }

        var params = {

        };
        if (lastTableName) {
            params.ExclusiveStartTableName = lastTableName;
        }

        this.logger.verbose('Fetching dynamo tables ...',  params);
        return this._dynamoDb.listTables(params)
            .then(result => {
                var tableNames = result.TableNames;
                if (prefix) {
                    tableNames = _.filter(tableNames, x => _.startsWith(x, prefix));
                }
                return Promise.serial(tableNames, x => {
                        return this.query(x)
                            .then(table => {
                                if (table) {
                                    results.push(table);
                                }
                            })
                    })
                    .then(() => {
                        if (result.LastEvaluatedTableName) {
                            return this.queryAll(prefix, result.LastEvaluatedTableName, results)
                        } else {
                            return results;
                        }
                    });
            });
    }

    _waitReady(table)
    {
        if (!table) {
            return null;
        }

        this.logger.info('Waiting Table %s ready...', table.TableName);

        if (table.TableStatus == 'CREATING' || table.TableStatus == 'UPDATING' || table.TableStatus == 'DELETING') {
            return Promise.timeout(10 * 1000)
                .then(() => {
                    return this.query(table.TableName);
                })
                .then(newTable => {
                    return this._waitReady(newTable);
                });
        }

        return table;
    }
}

module.exports = AWSDynamoClient;
