const execa = require('execa');
const bluebird = require('bluebird');
const which = bluebird.promisify(require('which'));
const path = require('path');
const fs = require('fs');
const fileType = require('file-type');
const readChunk = require('read-chunk');
const _ = require('lodash');
const readline = require('readline');
const moment = require('moment');

const util = require('./util');

bluebird.promisifyAll(fs);


function showFfmpegFail(err) {
  alert(`Failed to run ffmpeg:\n${err.stack}`);
  console.error(err.stack);
}

function getWithExt(name) {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

function canExecuteFfmpeg(ffmpegPath) {
  return execa(ffmpegPath, ['-version']);
}

function getFfmpegPath() {
    // dirname in production:
  // D:\data\vs\lossless-cut\package\LosslessCut-win32-x64\resources\app.asar
    // dirname in dev
  // D:\data\vs\lossless-cut\dist
  const internalFfmpeg = path.join(__dirname, '..', 'app.asar.unpacked', 'ffmpeg', getWithExt('ffmpeg'));
    //console.log('__dirname:');
    //console.log(__dirname);
  return canExecuteFfmpeg(internalFfmpeg)
    .then(() => internalFfmpeg)
    .catch(() => {
      console.log('Internal ffmpeg unavail');
      return which('ffmpeg');
    });
}

function handleProgress(process, cutDuration, onProgress) {
  const rl = readline.createInterface({ input: process.stderr });
  rl.on('line', (line) => {
    try {
      const match = line.match(/frame=\s*[^\s]+\s+fps=\s*[^\s]+\s+q=\s*[^\s]+\s+(?:size|Lsize)=\s*[^\s]+\s+time=\s*([^\s]+)\s+/); // eslint-disable-line max-len
      if (!match) return;

      const str = match[1];
      console.log(str);
      const progressTime = moment.duration(str).asSeconds();
      console.log(progressTime);
      onProgress(progressTime / cutDuration);
    } catch (err) {
      console.log('Failed to parse ffmpeg progress line', err);
    }
  });
}

function handleProgressOtherTasks(process, cutDuration, onProgress) {
  const rl = readline.createInterface({ input: process.stderr });
  rl.on('line', (line) => {
    try {
      const match = line.match(/(?:size|Lsize)=\s*[^\s]+\s+time=\s*([^\s]+)\s+/); // eslint-disable-line max-len
      if (!match) return;

      const str = match[1];
      console.log(str);
      const progressTime = moment.duration(str).asSeconds();
      console.log(progressTime);
      onProgress(progressTime / cutDuration);
    } catch (err) {
      console.log('Failed to parse ffmpeg progress line', err);
    }
  });
}

async function extractAudio( filePath,  duration,   onProgress, selectedAudio, dts){

    console.log('selected', selectedAudio); // number of audio stream 0:a:n

    var outPath = path.dirname(filePath) + '\\' +  path.parse(filePath).name + '.wav' ;
    var args = ['-i', filePath, outPath];

       //ffmpeg -y -i VTS_01_1.VOB -filter_complex "[0:a:2]channelsplit=channel_layout=5.1[FL][FR][FC][LFE][BL][BR];[FL][FR]amerge=inputs=2[front];[BL][BR]amerge=inputs=2[back];[LFE]anullsink" -map "[front]" front.wav -map "[back]" back.wav -map "[FC]" center.wav
    //if (path.parse(filePath).ext.toUpperCase() === '.VOB') {
    //    args=['-y', '-i', filePath, '-filter_complex', '"[0:a:' + selectedAudio + ']channelsplit=channel_layout=5.1[FL][FR][FC][LFE][BL][BR];[FL][FR]amerge=inputs=2[front];[BL][BR]amerge=inputs=2[back];[LFE]anullsink"'
    //        , '-map' ,'"[front]"',  'front.wav',  '-map',  '"[back]"', 'back.wav', '-map', '"[FC]"' ,'center.wav'];
    //}
    if (path.parse(filePath).ext.toUpperCase() === '.VOB') {
        var dir = path.dirname(filePath);
        var fileName = path.basename(filePath);
        var files = fs.readdirSync(dir);
        var relatedFiles=[];
        console.log( fileName);
        var matches = fileName.match(/VTS_(\d\d)_\d\.VOB/);
        var matchNum ="";
        if (matches && matches.length > 1) {
            matchNum= matches[1];
        }
        console.log( 'matchnum' , matchNum);
        if (matchNum) {
            var regExp = new RegExp("VTS_"+ matchNum + "_\\d\.VOB");
            console.log( 'regexp', regExp);
            for (var i = 0; i < files.length; i++) {
                // VTS_01_1.VOB
                
                if ( regExp.test( files[i])) {
                    relatedFiles.push( files[i]);
                }
            }
        }
        var input = filePath;
        if (relatedFiles.length > 1) {
            // -i "concat:VTS_01_1.VOB|VTS_01_2.VOB|VTS_01_3.VOB|VTS_01_4.VOB"
            input = 'concat:';
            for (var i = 0; i < relatedFiles.length; i++) {
                input += dir+'\\' + relatedFiles[i];
                if (i < relatedFiles.length - 1) {
                    input+= '|';
                }
            }
        }
        console.log( 'input: ', input);
        if (dts) {
            args = ['-y', '-i', input, '-filter_complex', '[0:a:' + selectedAudio + ']channelsplit=channel_layout=5.1[FL][FR][FC][LFE][BL][BR];[FL][FR]amerge=inputs=2[front];[BL][BR]amerge=inputs=2[back];[LFE]anullsink'
                , '-map', '[front]', filePath + '-front.wav', '-map', '[back]', filePath + '-back.wav', '-map', '[FC]', filePath + '-center.wav'];
        }
        else {
            args = ['-y', '-i', input, '-map', '0:a:' + selectedAudio, filePath + '.wav'];
        }
    }

    const ffmpegPath = await getFfmpegPath();
    console.log( args.join(" "));
    const process = execa(ffmpegPath, args);
    // size=  972876kB time=01:26:28.67 bitrate=1536.0kbits/s speed= 687x
    handleProgressOtherTasks(process, duration, onProgress);
    const result = await process;
    console.log(result.stdout);
}

async function merge({
    customOutDir, filePath, format, scenes, videoDuration, onProgress,stripAudio
}) {
    onProgress(0);

    console.log('merge ' + filePath);
    var subDir = (customOutDir ? customOutDir : path.dirname(filePath)) + '\\' + path.parse( path.basename(filePath)).name;
    if (!fs.existsSync(subDir)){
        fs.mkdirSync(subDir);
    }
    // write filelist file
    var fileListPath = subDir + "\\filelist.txt";

    if (fs.existsSync(fileListPath)) {
        fs.unlinkSync(fileListPath, (err) => {
            if (err) throw err;
            console.log(fileListPath + ' was deleted');
        });
    }
    var stream = fs.createWriteStream(fileListPath, { flags: 'a', mode: 0o777 });

    var ref = { outPath: "" };
    onProgress(2 / (scenes.length + 2));

    for (var i = 0; i < scenes.length; i++) {
        var scene = scenes[i];
        var ret= await cutOnIframe({
            customOutDir:subDir, filePath, format, cutFrom: scene.left, cutTo:scene.right, videoDuration,
            rotation: undefined, includeAllStreams: false, onProgress: function (p) { },stripAudio
        }, ref);
        stream.write(`file '${ref.outPath}'\r\n`);

        onProgress( (i+2) / (scenes.length + 2))
    }
    stream.end();
    var mergeFilePath = (customOutDir ? customOutDir : path.dirname(filePath)) + '\\' +  path.parse(filePath).name + '_cut' + path.parse(filePath).ext;

    var args = ['-y', '-f', 'concat', '-safe', '0', '-i', fileListPath, '-c', 'copy', mergeFilePath];
    const ffmpegPath = await getFfmpegPath();
    const process = execa(ffmpegPath, args);
    const result = await process;
    console.log(result.stdout);
    //onProgress(i / scenes.length);
}


async function cut({
  customOutDir, filePath, format, cutFrom, cutTo, videoDuration, rotation, includeAllStreams,
  onProgress, stripAudio,
}, ref) {
  const ext = path.extname(filePath) || `.${format}`;
  const cutSpecification = `${util.formatDuration(cutFrom, true)}-${util.formatDuration(cutTo, true)}`;

  const outPath = util.getOutPath(customOutDir, filePath, `${cutSpecification}${ext}`);
  ref.outPath = outPath;

  console.log('Cutting from', cutFrom, 'to', cutTo);

  // https://github.com/mifi/lossless-cut/issues/50
  const cutFromArgs = cutFrom === 0 ? [] : ['-ss', cutFrom];
  const cutToArgs = cutTo === videoDuration ? [] : ['-t', cutTo - cutFrom];

  const rotationArgs = rotation !== undefined ? ['-metadata:s:v:0', `rotate=${rotation}`] : [];
  const ffmpegArgs = [
    '-i', filePath, '-y',
    ...(stripAudio ? ['-an'] : ['-acodec', 'copy']),
    '-vcodec', 'copy',
    '-scodec', 'copy',
    ...cutFromArgs, ...cutToArgs,
    ...(includeAllStreams ? ['-map', '0'] : []),
    '-map_metadata', '0',
    ...rotationArgs,
    '-f', format,
    outPath,
  ];

  // ffmpeg -noaccurate_seek -ss 112.509469 -i D:\gladbeck.mp4 -y -vcodec copy -acodec copy -scodec copy -t 4857.761796000001 -map_metadata 0 -f mov -avoid_negative_ts make_zero D:\gladbeck.mp4-00.01.52.509-01.22.50.271.mp4

  console.log('ffmpeg', ffmpegArgs.join(' '));

  onProgress(0);

  const ffmpegPath = await getFfmpegPath();
  const process = execa(ffmpegPath, ffmpegArgs);
    // output of ffmpeg:
    //frame=60729 fps=41117 q=-1.0 Lsize=  114178kB time=01:20:57.75 bitrate= 192.5kbits/s speed=3.29e+003x
  handleProgress(process, cutTo - cutFrom, onProgress);
  const result = await process;
  console.log(result.stdout);

  return util.transferTimestamps(filePath, outPath);
}


// https://github.com/mifi/lossless-cut/issues/13
async function cutOnIframe({
  customOutDir, filePath, format, cutFrom, cutTo, videoDuration, rotation, includeAllStreams,
  onProgress, stripAudio,
}, ref) {
  const ext = path.extname(filePath) || `.${format}`;
  const cutSpecification = `${util.formatDuration(cutFrom, true)}-${util.formatDuration(cutTo, true)}`;

  const outPath = util.getOutPath(customOutDir, filePath, `${cutSpecification}${ext}`);
  ref.outPath = outPath;
    console.log('customOutDir' ,customOutDir);

  console.log('Cutting from', cutFrom, 'to', cutTo);

  // https://github.com/mifi/lossless-cut/issues/50
  const cutFromArgs = cutFrom === 0 ? [] : ['-ss', cutFrom];
  const cutToArgs = cutTo === videoDuration ? [] : ['-t', cutTo - cutFrom];

  const rotationArgs = rotation !== undefined ? ['-metadata:s:v:0', `rotate=${rotation}`] : [];
  const ffmpegArgs = [
     '-noaccurate_seek', ...cutFromArgs,'-i', filePath, '-y', '-vcodec', 'copy', ...(stripAudio ? ['-an'] : ['-acodec', 'copy']), '-scodec', 'copy',
     ...cutToArgs,
    ...(includeAllStreams ? ['-map', '0'] : []),
    '-map_metadata', '0',
    ...rotationArgs,
      '-f', format,
      '-avoid_negative_ts', 'make_zero',
    outPath,
  ];

  // ffmpeg -noaccurate_seek -ss 112.509469 -i D:\gladbeck.mp4 -y -vcodec copy -acodec copy -scodec copy -t 4857.761796000001 -map_metadata 0 -f mov -avoid_negative_ts make_zero D:\gladbeck.mp4-00.01.52.509-01.22.50.271.mp4

  console.log('ffmpeg', ffmpegArgs.join(' '));

  onProgress(0);

  const ffmpegPath = await getFfmpegPath();
  const process = execa(ffmpegPath, ffmpegArgs);
    // output of ffmpeg:
    //frame=60729 fps=41117 q=-1.0 Lsize=  114178kB time=01:20:57.75 bitrate= 192.5kbits/s speed=3.29e+003x
  handleProgress(process, cutTo - cutFrom, onProgress);
  const result = await process;
  console.log(result.stdout);

  return util.transferTimestamps(filePath, outPath);
}


async function html5ify(filePath, outPath, encodeVideo, duration, onProgress) {
  console.log('Making HTML5 friendly version', { filePath, outPath, encodeVideo });

  // '-c:a', 'libfdk_aac' ,'-b:a 64k'
  const videoArgs = encodeVideo
    ? ['-vf', 'scale=-2:400,format=yuv420p', '-sws_flags', 'neighbor', '-vcodec', 'libx264', '-profile:v', 'baseline', '-x264opts', 'level=3.0', '-preset:v', 'ultrafast', '-crf', '28']
    : ['-vcodec', 'copy'];

  const ffmpegArgs = [
    '-i', filePath, ...videoArgs, 
    '-y',
    outPath,
  ];

  console.log('ffmpeg', ffmpegArgs.join(' '));

  const ffmpegPath = await getFfmpegPath();
  const process = execa(ffmpegPath, ffmpegArgs);
  handleProgressOtherTasks(process, duration, onProgress);
  const result = await process;
  console.log(result.stdout);
}

async function createWaveform(filePath, duration, onProgress) {
  console.log('create waveform', { filePath });

    // ffmpeg -i VTS_01_1.VOB -ac 1 -filter:a aresample=4000 -map 0:a:2 -c:a pcm_s16le -f data test.dat
   const ffmpegArgs = [
    '-i', filePath, '-ac', '1',  '-filter:a', 'aresample=2000', '-map', '0:a:2', '-c:a', 
    'pcm_s16le', '-f', 'data', filePath +'.dat', '-y'
  ];

  console.log('ffmpeg', ffmpegArgs.join(' '));

  const ffmpegPath = await getFfmpegPath();
  const process = execa(ffmpegPath, ffmpegArgs);
  handleProgressOtherTasks(process, duration, onProgress);
  const result = await process;
  console.log(result.stdout);
}


async function convert(filePath, outPath, encodeVideo, duration,onProgress) {
  console.log('convert to mp4', { filePath, outPath, encodeVideo });

  // cmd: ffmpeg -i expo.avi -vf scale=-2:400,format=yuv420p -sws_flags neighbor -vcodec libx264 -profile:v baseline -x264opts level=3.0 -preset:v slow -crf 17 -an -y expo.mp4
  const videoArgs = encodeVideo
    ? ['-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-sws_flags', 'neighbor', '-vcodec', 'libx264', '-profile:v', 'baseline', '-x264opts', 'level=3.0', '-preset:v', 'slow', '-crf', '20']
    : ['-vcodec', 'copy'];

  //const videoArgs = encodeVideo
  //  ? ['-vf', 'scale=-2:400,format=yuv420p', '-sws_flags', 'neighbor', '-vcodec', 'libx264', '-profile:v', 'baseline', '-x264opts', 'level=3.0', '-preset:v', 'ultrafast', '-crf', '28']
  //  : ['-vcodec', 'copy'];

  const ffmpegArgs = [
    '-i', filePath, ...videoArgs, '-an',
    '-y',
    outPath,
  ];

  console.log('ffmpeg', ffmpegArgs.join(' '));

  const ffmpegPath = await getFfmpegPath();
  const process = execa(ffmpegPath, ffmpegArgs);
  handleProgressOtherTasks(process, duration, onProgress);
  const result = await process;
  console.log(result.stdout);
}

/**
 * ffmpeg only supports encoding certain formats, and some of the detected input
 * formats are not the same as the names used for encoding.
 * Therefore we have to map between detected format and encode format
 * See also ffmpeg -formats
 */
function mapFormat(requestedFormat) {
  switch (requestedFormat) {
    // These two cmds produce identical output, so we assume that encoding "ipod" means encoding m4a
    // ffmpeg -i example.aac -c copy OutputFile2.m4a
    // ffmpeg -i example.aac -c copy -f ipod OutputFile.m4a
    // See also https://github.com/mifi/lossless-cut/issues/28
    case 'm4a': return 'ipod';
    case 'aac': return 'ipod';
    default: return requestedFormat;
  }
}

function determineOutputFormat(ffprobeFormats, ft) {
  if (_.includes(ffprobeFormats, ft.ext)) return ft.ext;
  return ffprobeFormats[0] || undefined;
}

//  Duration: 00:01:25.59, start: 0.000000, bitrate: 334 kb/s
//    Stream #0:0: Video: h264 (Main) (H264 / 0x34363248), yuv420p(progressive), 320x240 [SAR 1:1 DAR 4:3]
//    Stream #0:1: Audio: aac (LC) ([255][0][0][0] / 0x00FF), 22050 Hz, stereo, fltp, 64 kb/s

//    Stream #0:0(und): Video: h264 (High) (avc1 / 0x31637661)
function isCodecOk(filePath) {

    return bluebird.try(() => {
    console.log('getDuration', filePath);

    return getFfmpegPath()
      .then(ffmpegPath => path.join(path.dirname(ffmpegPath), getWithExt('ffprobe')))
      .then(ffprobePath => execa(ffprobePath, [
        filePath,
      ]))
      .then((result) => {
          console.log( 'output', result.stderr);
        const match = result.stderr.match(/\s+Stream\s?#\d:\d\s?\([a-z]{3}\)\s?:\s?Video:(.+)(?=,)?,?(.+?)?(?=,)?/);
        if (!match) return false;

        console.log('regexp', match[1]);
        console.log('regexp', match[2]);
          if (match[1].includes("h264")) {
              return true;
          }
          else {
              return false;
          }
      });
  });
}

//Stream #0:0[0x1bf]: Data: dvd_nav_packet
//Stream #0:1[0x1e0]: Video: mpeg2video (Main), yuv420p(tv, top first), 720x576 [SAR 64:45 DAR 16:9], 25 fps, 25 tbr, 90k tbn, 50 tbc
//Stream #0:2[0x80]: Audio: ac3, 48000 Hz, stereo, fltp, 192 kb/s
//Stream #0:3[0x81]: Audio: ac3, 48000 Hz, 5.1(side), fltp, 448 kb/s
//Stream #0:4[0x82]: Audio: ac3, 48000 Hz, 5.1(side), fltp, 448 kb/s
function getAudioStreams(filePath) {

    return bluebird.try(() => {
    console.log('getAudioStreams', filePath);

    return getFfmpegPath()
      .then(ffmpegPath => path.join(path.dirname(ffmpegPath), getWithExt('ffprobe')))
      .then(ffprobePath => execa(ffprobePath, [
        filePath,
      ]))
      .then((result) => {
        var re = /^\s+Stream\s?#\d:\d\s?(.+)\s?:\s?Audio:\s?(.+)$/gm
        var matches =  [];
        var match;
        while (match = re.exec(result.stderr)) {
            console.log( match);
            matches.push( match[1] + ' ' + match[2]);
        }
        console.log( matches);
        return matches;
        //return matches.slice(1);
      });
  });
}



//ffprobe -of json -show_format -i gladbeck.mp4
//"format": {
//    "filename": "gladbeck.mp4",
//    "nb_streams": 2,
//    "nb_programs": 0,
//    "format_name": "mov,mp4,m4a,3gp,3g2,mj2",
//    "format_long_name": "QuickTime / MOV",
//    "start_time": "0.000000",
//    "duration": "5188.672000",
//    "size": "124119994",
//    "bit_rate": "191370",
//    "probe_score": 100,
//    "tags": {
//        "major_brand": "mp42",
//        "minor_version": "0",
//        "compatible_brands": "isom",
//        "creation_time": "2018-03-02T11:38:28.000000Z"
//    }
//}
function getDuration(filePath) {
  return bluebird.try(() => {
    console.log('getDuration', filePath);

    return getFfmpegPath()
      .then(ffmpegPath => path.join(path.dirname(ffmpegPath), getWithExt('ffprobe')))
      .then(ffprobePath => execa(ffprobePath, [
        '-of', 'json', '-show_format', '-i', filePath,
      ]))
      .then((result) => {
        const strDuration = JSON.parse(result.stdout).format.duration;
        console.log('duration', strDuration);
        return strDuration;
      });
  });
}


function getFormat(filePath) {
  return bluebird.try(() => {
    console.log('getFormat', filePath);

    return getFfmpegPath()
      .then(ffmpegPath => path.join(path.dirname(ffmpegPath), getWithExt('ffprobe')))
      .then(ffprobePath => execa(ffprobePath, [
        '-of', 'json', '-show_format', '-i', filePath,
      ]))
      .then((result) => {
        const formatsStr = JSON.parse(result.stdout).format.format_name;
        console.log('formats', formatsStr);
        const formats = (formatsStr || '').split(',');

        // ffprobe sometimes returns a list of formats, try to be a bit smarter about it.
        return readChunk(filePath, 0, 4100)
          .then((bytes) => {
            const ft = fileType(bytes) || {};
            console.log(`fileType detected format ${JSON.stringify(ft)}`);
            const assumedFormat = determineOutputFormat(formats, ft);
            return mapFormat(assumedFormat);
          });
      });
  });
}


module.exports = {
  extractAudio,
  merge,
  cut,
  cutOnIframe,
  getFormat,
  isCodecOk,
  getDuration,
  getAudioStreams,
  showFfmpegFail,
  html5ify,
  convert
};
