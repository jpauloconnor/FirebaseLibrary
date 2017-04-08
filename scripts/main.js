'use strict';

// Initializes FireNotes
function FireNotes() {
  this.checkSetup();

  this.noteList = document.getElementById('notes');
  this.noteForm = document.getElementById('note-form');
  this.noteInput = document.getElementById('note');
  this.submitButton = document.getElementById('submit');
  this.submitImageButton = document.getElementById('submitImage');
  this.imageForm = document.getElementById('image-form');
  this.mediaCapture = document.getElementById('mediaCapture');
  this.userName = document.getElementById('user-name');
  this.signInButton = document.getElementById('sign-in');
  this.signOutButton = document.getElementById('sign-out');

  // Saves message on form submit.
  this.noteForm.addEventListener('submit', this.saveNote.bind(this));
  this.signOutButton.addEventListener('click', this.signOut.bind(this));
  this.signInButton.addEventListener('click', this.signIn.bind(this));

  // Toggle for the button.
  var buttonTogglingHandler = this.toggleButton.bind(this);
  this.noteInput.addEventListener('keyup', buttonTogglingHandler);
  this.noteInput.addEventListener('change', buttonTogglingHandler);

  // Events for image upload.
  this.submitImageButton.addEventListener('click', function(e) {
    e.preventDefault();
    this.mediaCapture.click();
  }.bind(this));
  this.mediaCapture.addEventListener('change', this.saveImageMessage.bind(this));

  this.initFirebase();
}



// Sets up shortcuts to Firebase features and initiate firebase auth.
FireNotes.prototype.initFirebase = function() {
  // Shortcuts to Firebase SDK features.
  this.auth = firebase.auth();
  this.database = firebase.database();
  this.storage = firebase.storage();
  // Initiates Firebase auth and listen to auth state changes.
  this.auth.onAuthStateChanged(this.onAuthStateChanged.bind(this));
};

// Loads chat messages history and listens for upcoming ones.
FireNotes.prototype.loadNotes = function() {
  // Reference to the /notes/ database path.
  this.messagesRef = this.database.ref('notes');
  // Make sure we remove all previous listeners.
  this.messagesRef.off();

  // Loads the last 10 notes and listen for new ones.
  var setNote = function(data) {
    var val = data.val();
    this.displayNote(data.key, val.text, val.imageUrl);
  }.bind(this);
  this.messagesRef.limitToLast(10).on('child_added', setNote);
  this.messagesRef.limitToLast(10).on('child_changed', setNote);
};


// Saves a new note on the Firebase DB.
FireNotes.prototype.saveNote = function(e) {
  e.preventDefault();
  // Check that the user entered a note and is signed in.
  if (this.messageInput.value && this.checkSignedInWithMessage()) {
    var currentUser = this.auth.currentUser;
    // Add a new note entry to the Firebase Database.
    this.messagesRef.push({
      name: currentUser.displayName,
      text: this.noteInput.value,
    }).then(function() {
      // Clear message text field and SEND button state.
      FireNotes.resetMaterialTextfield(this.noteInput);
      this.toggleButton();
    }.bind(this)).catch(function(error) {
      console.error('Error writing new message to Firebase Database', error);
    });
  }
};



// Sets the URL of the given img element with the URL of the image stored in Cloud Storage.
FireNotes.prototype.setImageUrl = function(imageUri, imgElement) {
  // If the image is a Cloud Storage URI we fetch the URL.
  if (imageUri.startsWith('gs://')) {
    imgElement.src = FireNotes.LOADING_IMAGE_URL; // Display a loading image first.
    this.storage.refFromURL(imageUri).getMetadata().then(function(metadata) {
      imgElement.src = metadata.downloadURLs[0];
    });
  } else {
    imgElement.src = imageUri;
  }
};




// Saves a new message containing an image URI in Firebase.
// This first saves the image in Firebase storage.
FireNotes.prototype.saveImageMessage = function(event) {
  event.preventDefault();
  var file = event.target.files[0];

  // Clear the selection in the file picker input.
  this.imageForm.reset();

  // Check if the file is an image.
  if (!file.type.match('image.*')) {
    var data = {
      message: 'You can only share images',
      timeout: 2000
    };
    this.signInSnackbar.MaterialSnackbar.showSnackbar(data);
    return;
  }

  // Check if the user is signed-in
  if (this.checkSignedInWithMessage()) {

    // We add a message with a loading icon that will get updated with the shared image.
    var currentUser = this.auth.currentUser;
    this.messagesRef.push({
      name: currentUser.displayName,
      imageUrl: FireNotes.LOADING_IMAGE_URL
    }).then(function(data) {

      // Upload the image to Cloud Storage.
      var filePath = currentUser.uid + '/' + data.key + '/' + file.name;
      return this.storage.ref(filePath).put(file).then(function(snapshot) {

        // Get the file's Storage URI and update the chat message placeholder.
        var fullPath = snapshot.metadata.fullPath;
        return data.update({imageUrl: this.storage.ref(fullPath).toString()});
      }.bind(this));
    }.bind(this)).catch(function(error) {
      console.error('There was an error uploading a file to Cloud Storage:', error);
    });
  }
};


// Signs-in Friendly Chat.
FireNotes.prototype.signIn = function() {
  // Sign in Firebase using popup auth and Google as the identity provider.
  var provider = new firebase.auth.GoogleAuthProvider();
  this.auth.signInWithPopup(provider);
};

// Signs-out of Friendly Chat.
FireNotes.prototype.signOut = function() {
  // Sign out of Firebase.
  this.auth.signOut();
};


// Triggers when the auth state change for instance when the user signs-in or signs-out.
FireNotes.prototype.onAuthStateChanged = function(user) {
  if (user) { // User is signed in!
    // Get user's name from the Firebase user object.
    var userName = user.displayName;

    // Set the user's name.
    this.userName.textContent = userName;

    // Show user's profile and sign-out button.
    this.userName.removeAttribute('hidden');
    this.signOutButton.removeAttribute('hidden');

    // Hide sign-in button.
    this.signInButton.setAttribute('hidden', 'true');

    //load notes.
    this.loadNotes();

    // We save the Firebase Messaging Device token and enable notifications.
    this.saveMessagingDeviceToken();
  } else { // User is signed out!
    // Hide user's profile and sign-out button.
    this.userName.setAttribute('hidden', 'true');
    this.userPic.setAttribute('hidden', 'true');
    this.signOutButton.setAttribute('hidden', 'true');

    // Show sign-in button.
    this.signInButton.removeAttribute('hidden');
  }
};


//user is signed-in. Otherwise false and displays a message.
FireNotes.prototype.checkSignedInWithMessage = function() {
  // Return true if the user is signed in Firebase
  if (this.auth.currentUser) {
    return true;
  }

  // Display a message to the user using a Toast.
  var data = {
    message: 'You must sign-in first',
    timeout: 2000
  };
  this.signInSnackbar.MaterialSnackbar.showSnackbar(data);
  return false;
};

// Saves the notes device token to the datastore.
FireNotes.prototype.saveMessagingDeviceToken = function() {
  firebase.messaging().getToken().then(function(currentToken) {
    if (currentToken) {
      console.log('Got FCM device token:', currentToken);
      // Saving the Device Token to the datastore.
      firebase.database().ref('/fcmTokens').child(currentToken)
          .set(firebase.auth().currentUser.uid);
    } else {
      // Need to request permissions to show notifications.
      this.requestNotificationsPermissions();
    }
  }.bind(this)).catch(function(error){
    console.error('Unable to get messaging token.', error);
  });
};

// Requests permissions to show notifications.
FireNotes.prototype.requestNotificationsPermissions = function() {
  console.log('Requesting notifications permission...');
  firebase.messaging().requestPermission().then(function() {
    // Notification permission granted.
    this.saveMessagingDeviceToken();
  }.bind(this)).catch(function(error) {
    console.error('Unable to get permission to notify.', error);
  });
};

// Resets the given MaterialTextField.
FireNotes.resetMaterialTextfield = function(element) {
  element.value = '';
  element.parentNode.MaterialTextfield.boundUpdateClassesHandler();
};

// Template for notes.
FireNotes.NOTE_TEMPLATE =
    '<div class="message-container">' +
      '<div class="note"></div>' +
      '<div class="name"></div>' +
    '</div>';

// A loading image URL.
FireNotes.LOADING_IMAGE_URL = 'https://www.google.com/images/spin-32.gif';

// Displays a Message in the UI.
FireNotes.prototype.displayNote = function(key, name, text, imageUri) {
  var div = document.getElementById(key);
  // If an element for that message does not exists yet we create it.
  if (!div) {
    var container = document.createElement('div');
    container.innerHTML = FireNotes.NOTE_TEMPLATE;
    div = container.firstChild;
    div.setAttribute('id', key);
    this.noteList.appendChild(div);
  }
 
  div.querySelector('.name').textContent = name;
  var noteElement = div.querySelector('.note');
  if (text) { // If the message is text.
    noteElement.textContent = text;
    // Replace all line breaks by <br>.
    noteElement.innerHTML = noteElement.innerHTML.replace(/\n/g, '<br>');
  } else if (imageUri) { // If the message is an image.
    var image = document.createElement('img');
    image.addEventListener('load', function() {
      this.noteList.scrollTop = this.noteList.scrollHeight;
    }.bind(this));
    this.setImageUrl(imageUri, image);
    noteElement.innerHTML = '';
    noteElement.appendChild(image);
  }
  // Show the card fading-in and scroll to view the new message.
  setTimeout(function() {div.classList.add('visible')}, 1);
  this.noteList.scrollTop = this.noteList.scrollHeight;
  this.noteInput.focus();
};

// Enables or disables the submit button depending on the values of the input
// fields.
FireNotes.prototype.toggleButton = function() {
  if (this.noteInput.value) {
    this.submitButton.removeAttribute('disabled');
  } else {
    this.submitButton.setAttribute('disabled', 'true');
  }
};

// Checks that the Firebase SDK has been correctly setup and configured.
FireNotes.prototype.checkSetup = function() {
  if (!window.firebase || !(firebase.app instanceof Function) || !window.config) {
    window.alert('You have not configured and imported the Firebase SDK. ' +
        'Make sure you go through the codelab setup instructions.');
  } else if (config.storageBucket === '') {
    window.alert('Your Cloud Storage bucket has not been enabled. Sorry about that. This is ' +
        'actually a Firebase bug that occurs rarely. ' +
        'Please go and re-generate the Firebase initialisation snippet (step 4 of the codelab) ' +
        'and make sure the storageBucket attribute is not empty. ' +
        'You may also need to visit the Storage tab and paste the name of your bucket which is ' +
        'displayed there.');
  }
};

window.onload = function() {
  window.FireNotes = new FireNotes();
};


