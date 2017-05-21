'use strict';

console.log('Loading function');

// DynamoDB stuff
var doc = require('dynamodb-doc');
var dynamodb = new doc.DynamoDB();
var tableName = "RequestTable"; 

// SQS stuff
var AWS = require('aws-sdk');
var QUEUE_URL = 'https://sqs.us-west-2.amazonaws.com/468979822992/MakerspaceRequests.fifo';
var sqs = new AWS.SQS({region : 'us-west-2'});

// AWS needs to know which region to look in (current setup is us-west-2)
AWS.config.update({
    region: "us-west-2",
});
var docClient = new AWS.DynamoDB.DocumentClient();

exports.handler = (event, context, callback) => {
    
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    var datetime = new Date().getTime().toString();
    
    event.Records.forEach((record) => {
        console.log(record.eventID);
        console.log(record.eventName);
        
        // record.eventName indicates what action DynamoDB is performing
        // INSERT means new entry is being inserted into table
        if(record.eventName == "INSERT") {
            var id = record.dynamodb.Keys.RequestID.S;
            var tableNum = record.dynamodb.NewImage.TableNum.S;
            
            // Parse data from DynamoDB table into SQS message
            var params = {
                MessageBody: JSON.stringify(tableNum),
                MessageGroupId: JSON.stringify('group1'),
                MessageDeduplicationId:  JSON.stringify(id+datetime),
                QueueUrl: QUEUE_URL
            };
            
            // Insert message into SQS
            sqs.sendMessage(params, function(err,data){
                if(err) {
                    console.log('error:',"Fail Send Message" + err);
                    context.done('error', "ERROR Put SQS");  // ERROR with message
                }else{
                    console.log('data:',data);
                    context.done(null,'');  // SUCCESS 
                }
            });
            
            // SPECIAL CASE: 
            // A hacky way of pushing the "send" button on the mobile
            // application was to send a blank DynamoDB table entry with "push" as 
            // the "TableNum" (Check Python script to see how this is processed).
            // After sending this message, immediately delete this DynamoDB entry
            // as this data does not need to be stored for later viewing
            if(tableNum == "push") {
                var deleteParams = {
                    TableName: tableName,
                    Key:{
                        "RequestID": id
                    }
                }
                console.log("Attempting to delete push item...");
                docClient.delete(deleteParams, function(err, data) {
                    if (err) {
                        console.error("Unable to delete item. Error JSON:", JSON.stringify(err, null, 2));
                    } else {
                        console.log("DeleteItem succeeded:", JSON.stringify(data, null, 2));
                    }
                });
            }
        }
    });
    callback(null, `Successfully processed ${event.Records.length} records.`);
    
};
