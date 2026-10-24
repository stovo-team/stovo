export function removeEndedVideoTracks(streams: Array<MediaStream | null>) {
  const uniqueStreams = [...new Set(streams.filter((stream): stream is MediaStream => Boolean(stream)))];
  const endedTracks = new Set(uniqueStreams.flatMap((stream) => stream.getVideoTracks()).filter((track) => track.readyState === "ended"));
  for (const stream of uniqueStreams) for (const track of endedTracks) stream.removeTrack(track);
}

export function stopVideoTracks(streams: Array<MediaStream | null>) {
  const uniqueStreams = [...new Set(streams.filter((stream): stream is MediaStream => Boolean(stream)))];
  const tracks = new Set(uniqueStreams.flatMap((stream) => stream.getVideoTracks()));
  for (const track of tracks) {
    for (const stream of uniqueStreams) stream.removeTrack(track);
    track.stop();
  }
}
