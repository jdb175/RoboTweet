/* VoiceTweet by Jason Whitehouse
This is a basic app that allows callers to make tweets to a twitter account with voice
recognition by calling a number. It is just an experiment, and I thought it might be fun
to hook up a transcriber to a twitter account.

To set this up, just fill in the missing variables here and in twitterkeys.js, then
change your twilio number's voice request url to 'http://yourserver.com/call/inbound (GET)' 
and messaging request url to 'http://yourserver.com/sms/inbound (POST)'
*/

var express = require('express');
var app = express();
var twilio = require('twilio')
var twitter = require('./twitterConnection');
var port = process.env.PORT || 8080;
var twilioNumber='YOUR_TWILIO_NUMBER';
var accountSid = 'YOUR_TWILIO_ACCOUNT_SID';
var authToken = "YOUR_TWILIO_AUTH_TOKEN";

app.use(express.bodyParser());

function basicCall (req, res, at) {
	// Create a TwiML response
	var resp = new twilio.TwimlResponse();

	//greet and record voice
	resp.say({voice:'woman'}, 'Record your tweet, then press any key to continue');
	var recordUrl = req.protocol + "://" + req.get('host') + '/recorded/';
	var transcribeUrl = req.protocol + "://" + req.get('host') + '/transcribed/';
	if(at) {
		transcribeUrl+=at;
		recordUrl+='true/';
	} else {
		recordUrl+='false/';
	}
	resp.record({transcribeCallback:transcribeUrl, action:recordUrl, method:'GET'});

	//Render the TwiML
	res.writeHead(200, {
	'Content-Type':'text/xml'
	});
	res.end(resp.toString());
}

//basic introduction for call-in
app.get('/call/inbound', function (req, res) {
	console.log("\nCALLED: " + req.originalUrl);
	basicCall(req, res);
});

//basic introduction for call-in
app.post('/call/inbound/:to', function (req, res) {
	var at = req.params.to;
	console.log("\nCALLED (post): " + req.originalUrl + ", " + at);
	basicCall(req, res, at);
});

//texting in to tweet @
app.post('/sms/inbound', function (req, res) {
	var at = req.body.Body.split(" ")[0];
	console.log("\nTexted in: " + req.originalUrl + " @" + at);
	var recordUrl = req.protocol + "://" + req.get('host') + '/call/inbound/' + at;
	
	// Call them back
	var client = new twilio.RestClient(accountSid, authToken);

	client.makeCall({
		from:twilioNumber,
		to:req.body.From,
		url:recordUrl
	});
});

//after recording
app.get('/recorded/:direct', function (req, res) {
	console.log("\nRECORDED: " +req.params.direct +" : "+ req.originalUrl);
	// Create a TwiML response
	var resp = new twilio.TwimlResponse();
	var digits = req.query.Digits;
	var recordUrl = req.protocol + "://" + req.get('host') + '/record/';

	//if we have no digits, then we have just recorded
	resp.say({voice:'woman'}, 'Your tweet has been recorded');
	//get user input if they did not text in
	if(req.params.direct == 'false'){
		resp.gather({ timeout:30, method:"GET", numDigits:1, action:recordUrl}, function() {
			this.say({voice:'woman'}, 'Press 1 to record another tweet, or any other key to end the call!');
		});
	}
	resp.say({voice:'woman'}, 'Thank you.');

	//Render the TwiML
	res.writeHead(200, {
	'Content-Type':'text/xml'
	});
	res.end(resp.toString());
});

//make additional recording
app.get('/record/', function (req, res) {
	console.log("\nPOST RECORDING: " + req.originalUrl);
	// Create a TwiML response
	var resp = new twilio.TwimlResponse();
	var digits = req.query.Digits;
	var recordUrl = req.protocol + "://" + req.get('host') + '/recorded/false/';

	if (digits[digits.length-1] == '1'){
		//if we have the digit '1', then we are recording again
		resp.say({voice:'woman'}, 'Please record your tweet, then press any key!');
		var transcribeUrl = req.protocol + "://" + req.get('host') + '/transcribed/';
		resp.record({transcribeCallback:transcribeUrl, action:recordUrl, method:'GET'});
	} else {
		//otherwise we can end
		resp.say({voice:'woman'}, 'Thank you.');
	}

	//Render the TwiML
	res.writeHead(200, {
	'Content-Type':'text/xml'
	});
	res.end(resp.toString());
});

//for successful transcription
app.post('/transcribed/(:to)?', function (req, res) {
	// Create client
	var client = new twilio.RestClient(accountSid, authToken);
	var at = req.params.to;
	var fromNumber
	//if this was texted in, we need to text the 'to' instead of the 'from' number
	if(at){
		fromNumber = req.body.To;
	} else {
		fromNumber = req.body.From;
	}
	var tweetText = req.body.TranscriptionText;
	var responseText;
	var trimmed = false;

	//notify caller if transcription failed
	if(tweetText == "(blank)" || req.body.TranscriptionStatus != 'completed'){
		client.sendSms({
			to:fromNumber,
			from:twilioNumber,
			body:'There was an error transcribing your tweet, please try calling again.'
			}, function(error, message) {
					if (!error) {
						console.log('Successfully notified caller: '+fromNumber);
					}
					else {
						console.log('Error notifying caller: '+fromNumber);
					}
			});
		return;
	}

	//append @ if given
	if(at) {
		console.log("TWEETING @" + at);
		tweetText = "@"+at+" "+tweetText;
	}

	//trim and tweet the content
	if(tweetText.length > 140){
		tweetText = tweetText.substr(0,139);
		trimmed = true;
	}
	twitter.tweet(tweetText, function(status){
		if(status == "Success") {
			console.log("\nTRANSCRIBED: '" + tweetText + "', caller is " + fromNumber);
			responseText = "Your tweet has been posted: '" + tweetText +"'";
		} else {
			console.log("\nTRANSCRIBED: error posting tweet");
			responseText = "Something went wrong posting your tweet, please try calling again.";
		}

		if(trimmed){
			responseText += ". It had to be trimmed because it was longer than 140 characters."
		}

		//send status sms to caller
		client.sendSms({
			to:fromNumber,
			from:twilioNumber,
			body:responseText
			}, function(error, message) {
					if (!error) {
						console.log('Successfully notified caller: '+fromNumber);
					}
					else {
						console.log('Error notifying caller: '+fromNumber);
					}
			});
	});
});

app.listen(port);