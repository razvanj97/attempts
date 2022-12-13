var functions = require("firebase-functions");
var admin = require("firebase-admin");
var cors = require("cors")({ origin: true });
var webpush = require("web-push");
var fs = require("fs");
var UUID = require("uuid-v4");
var os = require("os");
var Busboy = require("busboy");
var path = require("path");

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//

var serviceAccount = require("./xmasgift-firebase-connect.json");

var gcconfig = {
	projectId: "xmasgift-365d6",
	keyFilename: "xmasgift-firebase-connect.json",
};

var gcs = require("@google-cloud/storage")(gcconfig);

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
	databaseURL:
		"https://xmasgift-365d6-default-rtdb.europe-west1.firebasedatabase.app/",
});

exports.savePosts = functions
	.region("europe-west1")
	.https.onRequest(function (request, response) {
		cors(
			request,
			response.set("Access-Control-Allow-Origin", "*"),

			function () {
				var uuid = UUID();

				const busboy = Busboy({ headers: request.headers });
				// These objects will store the values (file + fields) extracted from busboy
				let upload;
				const fields = {};

				// This callback will be invoked for each file uploaded

				busboy.on("file", (fieldname, file, info) => {
					const { filename, encoding, mimetype } = info;
					console.log(
						`File [${fieldname}] filename: ${filename}, encoding: ${encoding}, mimetype: ${mimetype}`
					);
					const filepath = path.join(os.tmpdir(), filename);
					upload = { file: filepath, type: mimetype };
					file.pipe(fs.createWriteStream(filepath));
				});

				// This will invoked on every field detected
				busboy.on(
					"field",
					function (
						fieldname,
						val,
						fieldnameTruncated,
						valTruncated,
						encoding,
						mimetype
					) {
						fields[fieldname] = val;
					}
				);

				// This callback will be invoked after all uploaded files are saved.
				busboy.on("finish", () => {
					var bucket = gcs.bucket("xmasgift-365d6.appspot.com");
					bucket.upload(
						upload.file,
						{
							uploadType: "media",
							metadata: {
								metadata: {
									contentType: upload.type,
									firebaseStorageDownloadTokens: uuid,
								},
							},
						},
						function (err, file) {
							if (!err) {
								admin
									.database()
									.ref("posts")
									.push({
										id: fields.id,
										title: fields.title,
										location: fields.location,
										rawLocation: {
											lat: fields.rawLocationLat,
											lng: fields.rawLocationLng,
										},
										image:
											"https://firebasestorage.googleapis.com/v0/b" +
											bucket.name +
											"/o/" +
											encodeURIComponent(file.name) +
											"?alt=media&token=" +
											uuid,
									})
									.then(function () {
										webpush.setVapidDetails(
											"mailto:eaaraj@students.eaaa.dk",
											"BNUG-q2i6JoH7EJqd4sYB8zB9kelLcHoxwTB737dNgG5E0CRQ6zLfpsQ66y3VMhOfYsVjC9yahqYs3YHkYDTDP4",
											"cx3eXPO07J3LilVPgXBIeCZ7asKd2p3zkf3Z6ZlDnzU"
										);
										return admin.database().ref("subscriptions").once("value");
									})
									.then(function (subscriptions) {
										subscriptions.forEach(function (sub) {
											var pushConfig = {
												endpoint: sub.val().endpoint,
												keys: {
													auth: sub.val().keys.auth,
													p256dh: sub.val().keys.p256dh,
												},
											};

											webpush
												.sendNotification(
													pushConfig,
													JSON.stringify({
														title: "New post",
														content: "New post added!",
														openUrl: "/",
													})
												)
												.catch(function (err) {
													console.log(err);
												});
										});
										response
											.status(201)
											.json({ message: "Data stored", id: fields.id });
									})
									.catch(function (err) {
										response.status(500).json({ error: err });
									});
							} else {
								console.log(err);
							}
						}
					);
				});

				// The raw bytes of the upload will be in request.rawBody.  Send it to busboy, and get
				// a callback when it's finished.
				busboy.end(request.rawBody);
				// formData.parse(request, function(err, fields, files) {
				//   fs.rename(files.file.path, "/tmp/" + files.file.name);
				//   var bucket = gcs.bucket("YOUR_PROJECT_ID.appspot.com");
				// });
			}
		);
	});
