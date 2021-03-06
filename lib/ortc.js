/**
 * Generate extended RTP capabilities for sending and receiving.
 *
 * @param {RTCRtpCapabilities} localCaps - Local capabilities.
 * @param {RTCRtpCapabilities} remoteCaps - Remote capabilities.
 *
 * @returns {RTCExtendedRtpCapabilities}
 */
exports.getExtendedRtpCapabilities = function(localCaps, remoteCaps)
{
	const extendedCaps =
	{
		codecs           : [],
		headerExtensions : [],
		fecMechanisms    : []
	};

	// Match media codecs and keep the order preferred by remoteCaps.
	for (const remoteCodec of remoteCaps.codecs || [])
	{
		// TODO: Ignore pseudo-codecs and feature codecs.
		if (remoteCodec.name === 'rtx')
			continue;

		const matchingLocalCodec = (localCaps.codecs || [])
			.find((localCodec) => matchCapCodecs(localCodec, remoteCodec));

		if (matchingLocalCodec)
		{
			const extendedCodec =
			{
				name               : matchingLocalCodec.name,
				mimeType           : matchingLocalCodec.mimeType,
				kind               : matchingLocalCodec.kind,
				clockRate          : matchingLocalCodec.clockRate,
				sendPayloadType    : matchingLocalCodec.preferredPayloadType,
				sendRtxPayloadType : null,
				recvPayloadType    : remoteCodec.preferredPayloadType,
				recvRtxPayloadType : null,
				channels           : matchingLocalCodec.channels,
				rtcpFeedback       : reduceRtcpFeedback(matchingLocalCodec, remoteCodec),
				parameters         : matchingLocalCodec.parameters
			};

			if (!extendedCodec.channels)
				delete extendedCodec.channels;

			extendedCaps.codecs.push(extendedCodec);
		}
	}

	// Match RTX codecs.
	for (const extendedCodec of extendedCaps.codecs || [])
	{
		const matchingLocalRtxCodec = (localCaps.codecs || [])
			.find((localCodec) => (
				localCodec.name === 'rtx' &&
				localCodec.parameters.apt === extendedCodec.sendPayloadType
			));

		const matchingRemoteRtxCodec = (remoteCaps.codecs || [])
			.find((remoteCodec) => (
				remoteCodec.name === 'rtx' &&
				remoteCodec.parameters.apt === extendedCodec.recvPayloadType
			));

		if (matchingLocalRtxCodec && matchingRemoteRtxCodec)
		{
			extendedCodec.sendRtxPayloadType = matchingLocalRtxCodec.preferredPayloadType;
			extendedCodec.recvRtxPayloadType = matchingRemoteRtxCodec.preferredPayloadType;
		}
	}

	// Match header extensions.
	for (const remoteExt of remoteCaps.headerExtensions || [])
	{
		const matchingLocalExt = (localCaps.headerExtensions || [])
			.find((localExt) => matchCapHeaderExtensions(localExt, remoteExt));

		if (matchingLocalExt)
		{
			const extendedExt =
			{
				kind   : remoteExt.kind,
				uri    : remoteExt.uri,
				sendId : matchingLocalExt.preferredId,
				recvId : remoteExt.preferredId
			};

			extendedCaps.headerExtensions.push(extendedExt);
		}
	}

	return extendedCaps;
};

/**
 * Generate RTP capabilities for receiving media based on the given extended
 * RTP capabilities.
 *
 * @param {RTCExtendedRtpCapabilities} extendedRtpCapabilities
 *
 * @returns {RTCRtpCapabilities}
 */
exports.getRecvRtpCapabilities = function(extendedRtpCapabilities)
{
	const caps =
	{
		codecs           : [],
		headerExtensions : [],
		fecMechanisms    : []
	};

	for (const capCodec of extendedRtpCapabilities.codecs)
	{
		const codec =
		{
			name                 : capCodec.name,
			mimeType             : capCodec.mimeType,
			kind                 : capCodec.kind,
			clockRate            : capCodec.clockRate,
			preferredPayloadType : capCodec.recvPayloadType,
			channels             : capCodec.channels,
			rtcpFeedback         : capCodec.rtcpFeedback,
			parameters           : capCodec.parameters
		};

		if (!codec.channels)
			delete codec.channels;

		caps.codecs.push(codec);

		// Add RTX codec.
		if (capCodec.recvRtxPayloadType)
		{
			const rtxCapCodec =
			{
				name                 : 'rtx',
				mimeType             : `${capCodec.kind}/rtx`,
				kind                 : capCodec.kind,
				clockRate            : capCodec.clockRate,
				preferredPayloadType : capCodec.recvRtxPayloadType,
				rtcpFeedback         : [],
				parameters           :
				{
					apt : capCodec.recvPayloadType
				}
			};

			caps.codecs.push(rtxCapCodec);
		}

		// TODO: In the future, we need to add FEC, CN, etc, codecs.
	}

	for (const capExt of extendedRtpCapabilities.headerExtensions)
	{
		const ext =
		{
			kind        : capExt.kind,
			uri         : capExt.uri,
			preferredId : capExt.recvId
		};

		caps.headerExtensions.push(ext);
	}

	caps.fecMechanisms = extendedRtpCapabilities.fecMechanisms;

	return caps;
};

/**
 * Whether media can be sent based on the given RTP capabilities.
 *
 * @param {String} kind
 * @param {RTCExtendedRtpCapabilities} extendedRtpCapabilities
 *
 * @returns {Boolean}
 */
exports.canSend = function(kind, extendedRtpCapabilities)
{
	return extendedRtpCapabilities.codecs.
		some((codec) => codec.kind === kind);
};

/**
 * Whether the given RTP parameters can be received with the given RTP
 * capabilities.
 *
 * @param {RTCRtpParameters} rtpParameters
 * @param {RTCExtendedRtpCapabilities} extendedRtpCapabilities
 *
 * @returns {Boolean}
 */
exports.canReceive = function(rtpParameters, extendedRtpCapabilities)
{
	if (rtpParameters.codecs.length === 0)
		return false;

	const firstMediaCodec = rtpParameters.codecs[0];

	return extendedRtpCapabilities.codecs
		.some((codec) => codec.recvPayloadType === firstMediaCodec.payloadType);
};

/**
 * Generate RTP parameters of the given kind for sending media.
 * Just the first media codec per kind is considered.
 * NOTE: mid, encodings and rtcp fields are left empty.
 *
 * @param {kind} kind
 * @param {RTCExtendedRtpCapabilities} extendedRtpCapabilities
 *
 * @returns {RTCRtpParameters}
 */
exports.getSendingRtpParameters = function(kind, extendedRtpCapabilities)
{
	const params =
	{
		mid              : null,
		codecs           : [],
		headerExtensions : [],
		encodings        : [],
		rtcp             : {}
	};

	for (const capCodec of extendedRtpCapabilities.codecs)
	{
		if (capCodec.kind !== kind)
			continue;

		const codec =
		{
			name         : capCodec.name,
			mimeType     : capCodec.mimeType,
			clockRate    : capCodec.clockRate,
			payloadType  : capCodec.sendPayloadType,
			channels     : capCodec.channels,
			rtcpFeedback : capCodec.rtcpFeedback,
			parameters   : capCodec.parameters
		};

		if (!codec.channels)
			delete codec.channels;

		params.codecs.push(codec);

		// Add RTX codec.
		if (capCodec.sendRtxPayloadType)
		{
			const rtxCodec =
			{
				name         : 'rtx',
				mimeType     : `${capCodec.kind}/rtx`,
				clockRate    : capCodec.clockRate,
				payloadType  : capCodec.sendRtxPayloadType,
				rtcpFeedback : [],
				parameters   :
				{
					apt : capCodec.sendPayloadType
				}
			};

			params.codecs.push(rtxCodec);
		}

		// NOTE: We assume a single media codec plus an optional RTX codec.
		// TODO: In the future, we need to add FEC, CN, etc, codecs.
		break;
	}

	for (const capExt of extendedRtpCapabilities.headerExtensions)
	{
		if (capExt.kind && capExt.kind !== kind)
			continue;

		const ext =
		{
			uri : capExt.uri,
			id  : capExt.sendId
		};

		params.headerExtensions.push(ext);
	}

	return params;
};

/**
 * Generate RTP parameters of the given kind for receiving media.
 * All the media codecs per kind are considered. This is useful for generating
 * a SDP remote offer.
 *
 * NOTE: mid, encodings and rtcp fields are left empty.
 * NOTE: This just makes sense for Plan-B in which all the receiving codecs
 * must share the very same parameters.
 *
 * @param {String} kind
 * @param {RTCExtendedRtpCapabilities} extendedRtpCapabilities
 *
 * @returns {RTCRtpParameters}
 */
exports.getReceivingFullRtpParameters = function(kind, extendedRtpCapabilities)
{
	const params =
	{
		mid              : null,
		codecs           : [],
		headerExtensions : [],
		encodings        : [],
		rtcp             : {}
	};

	for (const capCodec of extendedRtpCapabilities.codecs)
	{
		if (capCodec.kind !== kind)
			continue;

		const codec =
		{
			name         : capCodec.name,
			mimeType     : capCodec.mimeType,
			clockRate    : capCodec.clockRate,
			payloadType  : capCodec.recvPayloadType,
			channels     : capCodec.channels,
			rtcpFeedback : capCodec.rtcpFeedback,
			parameters   : capCodec.parameters
		};

		if (!codec.channels)
			delete codec.channels;

		params.codecs.push(codec);

		// Add RTX codec.
		if (capCodec.recvRtxPayloadType)
		{
			const rtxCodec =
			{
				name        : 'rtx',
				mimeType    : `${capCodec.kind}/rtx`,
				clockRate   : capCodec.clockRate,
				payloadType : capCodec.recvRtxPayloadType,
				parameters  :
				{
					apt : capCodec.recvPayloadType
				}
			};

			params.codecs.push(rtxCodec);
		}

		// TODO: In the future, we need to add FEC, CN, etc, codecs.
	}

	for (const capExt of extendedRtpCapabilities.headerExtensions)
	{
		if (capExt.kind && capExt.kind !== kind)
			continue;

		const ext =
		{
			uri : capExt.uri,
			id  : capExt.recvId
		};

		params.headerExtensions.push(ext);
	}

	return params;
};

function matchCapCodecs(aCodec, bCodec)
{
	const aMimeType = aCodec.mimeType.toLowerCase();
	const bMimeType = bCodec.mimeType.toLowerCase();

	if (aMimeType !== bMimeType)
		return false;

	if (aCodec.clockRate !== bCodec.clockRate)
		return false;

	if (aCodec.channels !== bCodec.channels)
		return false;

	// Match H264 parameters.
	if (aMimeType === 'video/h264')
	{
		const aPacketizationMode = (aCodec.parameters || {})['packetization-mode'] || 0;
		const bPacketizationMode = (bCodec.parameters || {})['packetization-mode'] || 0;

		if (aPacketizationMode !== bPacketizationMode)
			return false;
	}

	return true;
}

function matchCapHeaderExtensions(aExt, bExt)
{
	if (aExt.kind && bExt.kind && aExt.kind !== bExt.kind)
		return false;

	if (aExt.uri !== bExt.uri)
		return false;

	return true;
}

function reduceRtcpFeedback(codecA, codecB)
{
	const reducedRtcpFeedback = [];

	for (const aFb of codecA.rtcpFeedback || [])
	{
		const matchingBFb = (codecB.rtcpFeedback || [])
			.find((bFb) => (
				bFb.type === aFb.type &&
				bFb.parameter === aFb.parameter
			));

		if (matchingBFb)
			reducedRtcpFeedback.push(matchingBFb);
	}

	return reducedRtcpFeedback;
}
