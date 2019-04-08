const express = require('express');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const path = require('path');

const app = express();
const http = require('http');
const fs = require('fs');
const labels = require('./app/handlers/labels');
const labs = require('./app/handlers/labs');
const configHandler = require('./app/handlers/config');
const networkHandler = require('./app/handlers/network');
const repoHandler = require('./app/handlers/repos');
const dockerImages = require('./app/handlers/docker-images');
const serviceHandler = require('./app/handlers/services')
// const installationHandler = require('./app/handlers/installation.js');
const treeRoutes = require('./app/handlers/tree_routes.js');
const Checker = require('./app/util/AppChecker.js');
const multer = require('multer');
const webSocketHandler = require('./app/util/ws_handler.js');
const localConfig = require('./config/local.config.json');
const healthChecker = require('./app/util/HealthLabState.js');
const errorHandler = require('express-error-handler');

const port = +process.env.PORT || 8080;
// var upload = multer({ dest: "uploads/" });
const storage = multer.memoryStorage();
const upload = multer({ storage });
const server = http.createServer(app);
const AppUtils = require('./app/util/AppUtils.js');
const dockerSocket = require('./app/util/docker_socket');

// const webshellConfigFile =
const log = AppUtils.getLogger();
// Initialize the checker
Checker.init((err) => {
  if (err) {
    console.error(err.message);
    throw err;
  }
});
// If is installed start the healtChecker
Checker.isInstalled((isInstalled) => {
  if (!localConfig.config.test && isInstalled) {
    healthChecker.run((err) => {
      if (err) {
        log.error('Health checker error!');
        log.error(err);
      }
    });
  }
});

// Parse application/x-www-form-urlencoded & JSON
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(methodOverride('X-HTTP-Method-Override'));
app.use('/webshell', express.static(path.join(__dirname, 'public','webshell')));
// app.use((err, req, res) => {
//  res.status(500);
//  res.end(`${err}\n`);
// });

// IT's TOO MUCH INFO FOR OUR APP , ANYWAY FOR FURTHER DEVELOPMENT UNCOMMENT
// app.use(log.requestLogger());

// Installation
// app.post('/dsp_v1/installation/', installationHandler.installation);

app.all('/', (req, res, next) => {
  // console.log("SONO QUI");
  Checker.isInstalled((installed) => {
    if (installed) {
      next();
    } else if (!res.headersSent) {
      res.redirect('/installation.html');
    }
  });
});

app.use(express.static(`${__dirname}/public`));
app.use((req, res, next) => {
  Checker.isInstalled((installed) => {
    if (installed) {
      next();
    } else {
      if (!res.headersSent) {
        res.redirect('/installation.html');
      }
    }
  });
});
// Api images
app.get('/dsp_v1/docker_images/', networkHandler.getListImages);
app.get('/dsp_v1/dsp_images', dockerImages.getImagesAllRepos);
app.get('/dsp_v1/dsp_images/:reponame', dockerImages.getImagesRepo);
//Api Hack Tools
app.get('/dsp_v1/hack_tools/', networkHandler.getListHackTools);
// Api labels
app.get('/dsp_v1/labels/:repo', labels.allLabels);
app.get('/dsp_v1/labels/:repo/:nameLab', labels.labelsOfLab);
// new label in a repository
app.post('/dsp_v1/labels/:repo', labels.addLabel);
// Change label
app.put('/dsp_v1/labels/:repo', labels.updateLabel);
app.delete('/dsp_v1/labels/:repo/:labelname', labels.deleteLabel);

// get all the repositories in main dir
app.get('/dsp_v1/all/', labs.getAll);
app.post('/dsp_v1/all/', labs.importLab);
// Api labs
app.get('/dsp_v1/labs/:repo', labs.getLabs);
app.get('/dsp_v1/labs/:repo/:labname', labs.getInformation);
app.put('/dsp_v1/labs/:labname', labs.saveInformation);
app.post('/dsp_v1/labs/:labname', (req, res) => {
  if (req.query.wantToCopy) {
    labs.copyLab(req, res);
  }
  else labs.newLab(req, res);
});

app.delete('/dsp_v1/labs/:labname', labs.deleteLab);

// Api config
app.get('/dsp_v1/config', configHandler.getConfig);
app.post('/dsp_v1/config', configHandler.updateConfig);


// Api docker network
app.get('/dsp_v1/docker_network/:namerepo/:namelab', networkHandler.get);
app.post('/dsp_v1/docker_network/:namelab', networkHandler.save);

// API DOCKER MANAGMENT
app.get('/dsp_v1/services', serviceHandler.getServices);
app.post('/dsp_v1/services/:nameservice', serviceHandler.runService);
app.put('/dsp_v1/services/start/:nameservice', serviceHandler.startService);
app.put('/dsp_v1/services/stop/:nameservice', serviceHandler.stopService);
app.put('/dsp_v1/services/defaultnetwork/:nameservice', serviceHandler.setAsDefault);
app.delete('/dsp_v1/services/:nameservice', serviceHandler.removeService);


// API GIT REPOS
app.get('/dsp_v1/git-repos', repoHandler.get);
app.delete('/dsp_v1/git-repos/:name', repoHandler.remove);

app.get('/dsp_v1/networkservices/:namerepo/:namelab', serviceHandler.getNetworkList);
app.post('/dsp_v1/networkservices', serviceHandler.attachNetwork);
app.delete('/dsp_v1/networkservices', serviceHandler.detachNetwork);

// Open docker shell
app.post('/dsp_v1/dockershell', networkHandler.dockershell)
// Copy from container to download dir
app.post('/dsp_v1/dockercopy', networkHandler.dockercopy)
app.post('/dsp_v1/dockerupload', networkHandler.dockerupload)

// Check if a dir exists
app.post('/dsp_v1/dir_exists', networkHandler.dirExists);
// Manage repositories

// Only for avatar
app.post('/upload', upload.single('avatar'), (req, res) => {
  if (req.file && req.file.buffer) {
    const buffer = req.file.buffer;
    const wstream = fs.createWriteStream('./public/assets/img/avatar.jpeg');
    wstream.write(buffer);
    wstream.end();
  }
  res.redirect('/');
});


// File manager chooser
// Home chooser
app.get('/api/tree/', treeRoutes.treeSearch);
// Lab chooser
app.get('/api/tree/repo', treeRoutes.projectTreeSearch);
app.get('/api/resource', treeRoutes.resourceSearch);
app.post('/api/tree/repo', treeRoutes.uploadFile);
app.delete('/api/tree/repo/', treeRoutes.deleteFile);
//

app.use('/', (req, res) => {
  res.sendFile(`${__dirname}/public/index.html`);
});

app.use(log.errorLogger());
// Log the error
app.use((err, req, res, next) => {
  log.error(err);
  next(err);
});


// Respond to errors and conditionally shut
// down the server. Pass in the server object
// so the error handler can shut it down
// gracefully:
app.use(errorHandler({ server }));
//  function fourOhFour(req, res) {
//    res.writeHead(404, { 'Content-Type': 'application/json' });
//    res.end(`${JSON.stringify(helpers.invalid_resource())}\n`);
//  }


/**
 * Initialise the server and start listening when we're ready!
 */
// project_init.init( (err, results) => {


//    if (err) {
//        console.error("** FATAL ERROR ON STARTUP: ");
//        console.error(err);
//        process.exit(-1);
//    }
// });

// error handler

// Initialize web socket handler
webSocketHandler.init(server);
dockerSocket.init(server);
// Set COMPOSE_INTERACTIVE_NO_CLI=1
process.env.COMPOSE_INTERACTIVE_NO_CLI = 1

server.listen(port, () => {
  if (localConfig.config.test) { log.warn('Testing mode enabled'); }
  log.info(`Server listening on port${port}`);
});

