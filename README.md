# mediasoup-client v3

[![][npm-shield-mediasoup-client]][npm-mediasoup-client]
[![][travis-ci-shield-mediasoup-client]][travis-ci-mediasoup-client]

**NOTE:** v3 is work in progress. The current stable version is 2.X.Y.

<!--
[![][npm-shield-mediasoup-client]][npm-mediasoup-client]
-->

JavaScript client side SDK for building [mediasoup](https://mediasoup.org) based applications.


## Website and documentation

* [mediasoup.org][mediasoup-website]


## Usage example

```js
import { Device } from 'mediasoup-client';
import mySignaling from './my-signaling'; // Our own signaling stuff.

// Create a device (use browser auto-detection).
const device = new Device();

// Communicate with our server app to retrieve router RTP capabilities.
const routerRtpCapabilities = 
  await mySignaling.request('getRouterCapabilities');

// Load the device with the router RTP capabilities.
await device.load({ routerRtpCapabilities });

// Check whether we can produce video to the router.
if (!device.canProduce('video'))
{
  console.warn('cannot produce video');

  // Abort next steps.
}

// Create a transport in the server for sending our media through it.
const sendTransportRemoteParameters = 
  await mySignaling.request('createTransport');

// Create the local representation of our server-side transport.
const sendTransport = device.createTransport(
  {
    transportRemoteParameters : sendTransportRemoteParameters,
    direction                 : 'send'
  });

// Set transport "connect" event handler.
sendTransport.on('connect', async (transportLocalParameters, callback, errback) =>
{
  // Here we must communicate our local parameters to our remote transport.
  try
  {
    await mySignaling.request(
      'transport-connect',
      { 
        transportId         : sendTransport.id,
        transportParameters : transportLocalParameters
      });

    // Done in the server, tell our transport.
    callback();
  }
  catch (error)
  {
    // Something was wrong in server side.
    errback(error);
  }
});

// Set transport "produce" event handler.
sendTransport.on('produce', async (producerLocalParameters, callback, errback) =>
{
  // Here we must communicate our local parameters to our remote transport.
  try
  {
    const producerRemoteParameters = await mySignaling.request(
      'produce',
      { 
        transportId        : sendTransport.id,
        producerParameters : producerLocalParameters
      });

    // Done in the server, pass the response to our transport.
    callback(producerRemoteParameters);
  }
  catch (error)
  {
    // Something was wrong in server side.
    errback(error);
  }
});

// Produce our webcam video.
const stream = await navigator.mediaDevices.getUserMedia({ video: true });
const webcamTrack = stream.getVideoTracks()[0];
const webcamProducer = await sendTransport.produce({ track: webcamTrack });
```


## Authors

* Iñaki Baz Castillo [[website](https://inakibaz.me)|[github](https://github.com/ibc/)]
* José Luis Millán [[github](https://github.com/jmillan/)]


## License

[ISC](./LICENSE)




[mediasoup-website]: https://mediasoup.org
[npm-shield-mediasoup-client]: https://img.shields.io/npm/v/mediasoup-client.svg
[npm-mediasoup-client]: https://npmjs.org/package/mediasoup-client
[travis-ci-shield-mediasoup-client]: https://travis-ci.com/versatica/mediasoup-client.svg?branch=master
[travis-ci-mediasoup-client]: https://travis-ci.com/versatica/mediasoup-client
