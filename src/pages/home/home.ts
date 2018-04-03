/* Anthony Krivonos */
/* April 2nd, 2018 */

import { Component } from '@angular/core';
import { NavController } from 'ionic-angular';

import { Camera, CameraOptions } from '@ionic-native/camera';

@Component({
      selector: 'page-home',
      templateUrl: 'home.html'
})
export class HomePage {

      // Imgur image upload endpoint
      public IMGUR_ENDPOINT:string = "https://api.imgur.com/3/image";
      // Imgur client ID
      public IMGUR_CLIENT_ID:string = "XXXXXXXXXX";

      // Azure Face API endpoint (West-Central US Server)
      public AZURE_ENDPOINT:string = "https://eastus.api.cognitive.microsoft.com/face/v1.0";
      // Azure Face API key
      public AZURE_API_KEY:string = "XXXXXXXXXX";

      // Global image that is encoded as a Base64 string
      public image:string;
      // Global error message that is shown when something goes wrong
      public error:string;
      // Global loading bool that indicates whether a photo is being analyzed
      public loading:boolean;

      // Array of key-value pairs for our analysis
      // Sample analysis data:
      // [ { "Feature": "Age", "Value": 25} ]
      public analysis:Array<object> = [];

      // Options for camera feature
      // Defaults to a selfie and takes square photos
      private options:CameraOptions = {
            destinationType: this.camera.DestinationType.DATA_URL,
            encodingType: this.camera.EncodingType.JPEG,
            mediaType: this.camera.MediaType.PICTURE,
            targetWidth: 600,
            targetHeight: 600,
            saveToPhotoAlbum: false,
            allowEdit: true,
            sourceType: 1,
            correctOrientation: false,
            cameraDirection: 1
      };

      // Injectable providers go in the constructor
      constructor(private navCtrl: NavController, private camera:Camera) {}

      // Perform our steps to facial analysis in asynchronous order
      // 1. Takes the photo
      // 2. Gets a photo link from imgur
      // 3. Analyzes face data from imgur link
      // If an error occurs in any of the steps, it is shown on the screen
      // and the asynchronous calls terminate.
      public analyzeFace():void {
            this.error = null;
            this.takePhoto(
                  // If photo was taken
                  (photo) => {
                        this.image = photo;
                        this.loading = true;
                        this.sendToImgur(photo,
                              // If Imgur returned an image link
                              (link) => {
                                    this.analyzeViaAzure(link,
                                          // If analysis worked
                                          (response) => {
                                                this.loading = false;
                                                this.analyzeFaceDetails(response);
                                          },
                                          // If analysis didn't work
                                          () => {
                                                this.loading = false;
                                                this.error = "Error: Azure couldn't analyze the photo.";
                                          }
                                    )
                              },
                              // If Imgur didn't return an image link
                              () => {
                                    this.error = "Error: Imgur couldn't return a link."
                              }
                        )
                  },
                  // If photo wasn't taken
                  () => {
                        this.error = "Error: Phone couldn't take the photo.";
                  }
            )
      }

      // Takes a photo and returns it in a callback
      // taken: callback that returns the base64 image
      // notTaken: callback that returns the error
      public takePhoto(taken:Function = null, notTaken:Function = null):void {
            this.camera.getPicture(this.options).then((imageData) => {
                  // For the sake of displaying our image, we have to add a
                  // data type to our base64 encoding. We'll snip this out later
                  // when retrieving a link from Imgur.
                  let base64Image:string = 'data:image/jpeg;base64,' + imageData;
                  if (taken != null) taken(base64Image);
            }, (e) => {
                  if (notTaken != null) notTaken(e);
            });
      }

      // POSTs a photo to Imgur in exchange for a link to the image
      // image: base64 encoded image
      // urlCallback: callback that returns the link to the image
      // failureCallback: callback that returns errors
      public sendToImgur(image:string, urlCallback:Function = null, failureCallback:Function = null):void {
            // Imgur requires that Base64 images be stripped of the
            // string 'data:image/...;base64,' so we snip it out here.
            image = image.substring(image.indexOf('base64,') + 'base64,'.length);

            // Imgur requires this string for authentication
            // It looks like: 'Client-ID XXXXXXXXXXXX' when sent
            let auth:string = `Client-ID ${this.IMGUR_CLIENT_ID}`;

            // Imgur wants an encoded form-data body
            // So we'll give it to them -> just append a key-value pair
            // with our 'snipped' base64 image.
            let body:FormData = new FormData();
            body.append('image', image);

            // Angular was very annoying in sending out a form-data request
            // using HttpModule (I spent 3 hours trying to solve it). But, instead, we
            // can send a request the old fashioned JavaScript way.

            // Create a POST request and authorize us via our auth variable from above
            var xhr = new XMLHttpRequest();
            xhr.open("POST", this.IMGUR_ENDPOINT, true);
            xhr.setRequestHeader("Authorization", auth);

            // Once the request is sent, we check to see if it's successful
            xhr.onreadystatechange = () => {
                  if (xhr.readyState == XMLHttpRequest.DONE) {
                        // 200 is a successful status code, meaning it worked!
                        if (xhr.status == 200) {
                              // We can grab the link from our HTTP response and call it back
                              let link = JSON.parse(xhr.response)['data']['link'];
                              if (urlCallback != null && link != null) {
                                    urlCallback(link);
                              }
                        } else if (xhr.status >= 400 && failureCallback != null) {
                              // If we receive a bad request error, we'll send our failure callback.
                              failureCallback();
                        }
                  }
            }

            // This synchronously sends our form-data body.
            xhr.send(body);
      }

      public analyzeViaAzure(link:string, analysisCallback:Function = null, failureCallback:Function = null):void {

            // This is a subfunction that converts an object into a serialized URL format.
            // For instance, { 'foo': 'bar' } becomes 'foo=bar'
            let serialize:string = (parameters:object) => Object.keys(parameters).map(key => key + '=' + parameters[key]).join('&');

            // Tell the server that we are querying/looking for a specific set of face data,
            // and want it in the appropriate format.
            let faceParameters:object = {
                  "returnFaceId": "true",
                  "returnFaceLandmarks": "false",
                  "returnFaceAttributes": "age,gender,headPose,smile,facialHair,glasses,emotion,hair,makeup,occlusion,accessories,blur,exposure,noise",
            }

            // We use the above function, serialize, to serialize our face parameters.
            let serializedFaceParameters:string = serialize(faceParameters);

            // Our body contains just one key, 'url', that contains our image link.
            // We must convert our body JSON into a string in order to POST it.
            let body = JSON.stringify({ "url": link });

            // Create a POST request with the serialized face parameters in our endpoint
            // Our API key is stored in the 'Ocp-Apim-Subscription-Key' header
            var xhr = new XMLHttpRequest();
            xhr.open("POST", `${this.AZURE_ENDPOINT}/detect?${serializedFaceParameters}`, true);
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.setRequestHeader("Ocp-Apim-Subscription-Key", this.AZURE_API_KEY);

            // Once the request is sent, we check to see if it's successful
            xhr.onreadystatechange = () => {
                  if (xhr.readyState == XMLHttpRequest.DONE) {
                        // 200 is a successful status code, meaning it worked!
                        if (xhr.status == 200) {
                              // We can grab the link from our HTTP response and call it back
                              if (analysisCallback != null) {
                                    analysisCallback(JSON.parse(xhr.response));
                              }
                        } else if (xhr.status >= 400 && failureCallback != null) {
                              // If we receive a bad request error, we'll send our failure callback.
                              console.error(JSON.stringify(JSON.parse(xhr.response), null, 2));
                              failureCallback();
                        }
                  }
            }

            xhr.send(body);
      }

      // Populate the analysis array from a Face API response object
      public analyzeFaceDetails(response:object):void {
            // Clear analysis array.
            this.analysis = [];

            // Retrieved face attributes object from response.
            let attributes = response[0]['faceAttributes'];

            // Convert two strings into a key-value pair for our
            // analysis list.
            let getAnalysisObject:object = (feature, value) => {
                  return { "feature": feature, "value": value };
            }

            // Converts 'john' into 'John'
            let capitalizeFirstLetter:string = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

            //
            // ~ Analysis Time ~
            //

            // Get age
            this.analysis.push(getAnalysisObject("Age", attributes['age']));

            // Get age
            this.analysis.push(getAnalysisObject("Gender", capitalizeFirstLetter(attributes['gender'])));

            // Get smiling (person is smiling if value is over 0.5)
            this.analysis.push(getAnalysisObject("Smiling?", (attributes['smile'] > 0.5 ? "Yes" : "No")));

            // Check if bald, if so, output that.
            // If not, give the person's hair color.
            if (attributes['hair']['bald'] > 0.8) {
                  this.analysis.push(getAnalysisObject("Is Bald?", "Yes"));
            } else if (attributes['hair']['hairColor'] && attributes['hair']['hairColor'].length > 0) {
                  this.analysis.push(getAnalysisObject("Hair Color", capitalizeFirstLetter(attributes['hair']['hairColor'][0]['color'])));
            }

            // Get person's emotion by looping through emotion object and grabbing the greatest value
            let moods = attributes['emotion'];
            var greatestEmotion, greatestEmotionValue;
            for (var mood in moods) {
                  if (moods[mood] && (!greatestEmotion || moods[mood] > greatestEmotionValue)) {
                        greatestEmotion = mood;
                        greatestEmotionValue = moods[mood];
                  }
            }
            this.analysis.push(getAnalysisObject("Emotion", capitalizeFirstLetter(greatestEmotion)));

      }

}
