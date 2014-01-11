var keys = require('./twitterkeys');
var twitter = require('ntwitter');


function tweet (content, callback) {
	var tweetObj = new twitter({
	  consumer_key: keys.consumerKey,
	  consumer_secret: keys.consumerSecret,
	  access_token_key: keys.token,
	  access_token_secret: keys.secret
	});

	tweetObj
		.verifyCredentials(function (err, data) {
		  	if(err){
		  		callback("Twitter authentication error: "+err)
		  	}
		})
		.updateStatus(content,
			function (err, data) {
				if(err){
					callback("Twitter posting error:"+err)
				} else {
					callback("Success")
				}
	    }
	  );
}

exports.tweet = tweet;