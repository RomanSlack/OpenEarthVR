using System;
using Newtonsoft.Json;

namespace OpenEarthVR.Core
{
    [Serializable]
    public class PanoMetadata
    {
        public string panoId;
        public PanoLocation location;
        public float heading;
        public int tileWidth;
        public int tileHeight;
        public int imageWidth;
        public int imageHeight;
        public string copyright;
        public PanoLink[] links;
    }

    [Serializable]
    public class PanoLocation
    {
        public double lat;
        public double lng;
    }

    [Serializable]
    public class PanoLink
    {
        public string panoId;
        public float heading;
        public string text;
    }

    [Serializable]
    public class SessionResponse
    {
        public string status;
    }

    [Serializable]
    public class PanoIdsRequest
    {
        public PanoLocation[] locations;
        public int radius;
    }

    [Serializable]
    public class PanoIdsResponse
    {
        public string[] panoIds;
    }
}
