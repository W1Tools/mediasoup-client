import sdpTransform from 'sdp-transform';

/**
 * Extract RTP capabilities from a SDP.
 *
 * @param {Object} sdpObj - SDP Object generated by sdp-transform.
 * @return {RTCRtpCapabilities}
 */
export function extractRtpCapabilities(sdpObj)
{
	// Map of RtpCodecParameters indexed by payload type.
	const codecsMap = new Map();

	// Array of RtpHeaderExtensions.
	const headerExtensions = [];

	// Whether a m=audio/video section has been already found.
	let gotAudio = false;
	let gotVideo = false;

	for (const m of sdpObj.media)
	{
		const kind = m.type;

		switch (kind)
		{
			case 'audio':
			{
				if (gotAudio)
					continue;

				gotAudio = true;
				break;
			}
			case 'video':
			{
				if (gotVideo)
					continue;

				gotVideo = true;
				break;
			}
			default:
			{
				continue;
			}
		}

		// Get codecs.
		for (const rtp of m.rtp)
		{
			const codec =
			{
				name                 : rtp.codec,
				mimeType             : `${kind}/${rtp.codec}`,
				kind                 : kind,
				clockRate            : rtp.rate,
				preferredPayloadType : rtp.payload,
				channels             : rtp.encoding,
				rtcpFeedback         : [],
				parameters           : {}
			};

			if (!(codec.channels > 1))
				delete codec.channels;

			codecsMap.set(codec.preferredPayloadType, codec);
		}

		// Get codec parameters.
		for (const fmtp of m.fmtp || [])
		{
			const parameters = sdpTransform.parseFmtpConfig(fmtp.config);
			const codec = codecsMap.get(fmtp.payload);

			if (!codec)
				continue;

			codec.parameters = parameters;
		}

		// Get RTCP feedback for each codec.
		for (const fb of m.rtcpFb || [])
		{
			const codec = codecsMap.get(fb.payload);

			if (!codec)
				continue;

			const feedback =
			{
				type      : fb.type,
				parameter : fb.subtype || ''
			};

			codec.rtcpFeedback.push(feedback);
		}

		// Get RTP header extensions.
		for (const ext of m.ext || [])
		{
			const headerExtension =
			{
				kind        : kind,
				uri         : ext.uri,
				preferredId : ext.value
			};

			headerExtensions.push(headerExtension);
		}
	}

	const rtpCapabilities =
	{
		codecs           : Array.from(codecsMap.values()),
		headerExtensions : headerExtensions,
		fecMechanisms    : [] // TODO
	};

	return rtpCapabilities;
}

/**
 * Extract DTLS parameters from a SDP.
 *
 * @param {Object} sdpObj - SDP Object generated by sdp-transform.
 * @return {RTCDtlsParameters}
 */
export function extractDtlsParameters(sdpObj)
{
	const media = getFirstActiveMediaSection(sdpObj);
	const fingerprint = media.fingerprint || sdpObj.fingerprint;
	let role;

	switch (media.setup)
	{
		case 'active':
			role = 'client';
			break;
		case 'passive':
			role = 'server';
			break;
		case 'actpass':
			role = 'auto';
			break;
	}

	const dtlsParameters =
	{
		role         : role,
		fingerprints :
		[
			{
				algorithm : fingerprint.type,
				value     : fingerprint.hash
			}
		]
	};

	return dtlsParameters;
}

/**
 * Get the first acive media section.
 *
 * @private
 * @param {Object} sdpObj - SDP Object generated by sdp-transform.
 * @return {Object} SDP media section as parsed by sdp-transform.
 */
function getFirstActiveMediaSection(sdpObj)
{
	return (sdpObj.media || [])
		.find((m) => m.iceUfrag && m.port !== 0);
}