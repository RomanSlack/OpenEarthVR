using System;
using System.Collections;
using System.Text;
using Newtonsoft.Json;
using UnityEngine;
using UnityEngine.Networking;

namespace OpenEarthVR.Core
{
    public class ApiClient : MonoBehaviour
    {
        public static ApiClient Instance { get; private set; }

        [SerializeField] private string serverUrl = "http://localhost:3001";

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
        }

        public string ServerUrl => serverUrl;

        // POST /api/session
        public IEnumerator CreateSession()
        {
            using var request = new UnityWebRequest($"{serverUrl}/api/session", "POST");
            request.uploadHandler = new UploadHandlerRaw(Array.Empty<byte>());
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");

            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
                Debug.LogError($"CreateSession failed: {request.error}");
            else
                Debug.Log("Session created successfully");
        }

        // GET /api/metadata — coroutine-based with callbacks
        public IEnumerator GetMetadataCoroutine(
            double lat, double lng, string panoId,
            Action<PanoMetadata> onSuccess,
            Action onFailure)
        {
            string url;
            if (!string.IsNullOrEmpty(panoId))
                url = $"{serverUrl}/api/metadata?panoId={UnityWebRequest.EscapeURL(panoId)}";
            else
                url = $"{serverUrl}/api/metadata?lat={lat}&lng={lng}&radius=500";

            using var request = UnityWebRequest.Get(url);
            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError($"GetMetadata failed: {request.error}");
                onFailure?.Invoke();
                yield break;
            }

            try
            {
                var metadata = JsonConvert.DeserializeObject<PanoMetadata>(
                    request.downloadHandler.text
                );

                // Apply defaults
                if (metadata.tileWidth == 0) metadata.tileWidth = 512;
                if (metadata.tileHeight == 0) metadata.tileHeight = 512;
                if (metadata.imageWidth == 0) metadata.imageWidth = 13312;
                if (metadata.imageHeight == 0) metadata.imageHeight = 6656;
                if (string.IsNullOrEmpty(metadata.copyright))
                    metadata.copyright = "\u00a9 Google";

                onSuccess?.Invoke(metadata);
            }
            catch (Exception e)
            {
                Debug.LogError($"Failed to parse metadata: {e.Message}");
                onFailure?.Invoke();
            }
        }

        // GET /api/tile/:z/:x/:y?panoId= — returns Texture2D
        public IEnumerator GetTile(
            int zoom, int x, int y, string panoId,
            Action<Texture2D> onSuccess,
            Action onFailure = null)
        {
            string url = $"{serverUrl}/api/tile/{zoom}/{x}/{y}?panoId={UnityWebRequest.EscapeURL(panoId)}";

            using var request = UnityWebRequestTexture.GetTexture(url, nonReadable: false);
            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogWarning($"Tile {zoom}/{x}/{y} failed: {request.error}");
                onFailure?.Invoke();
                yield break;
            }

            var texture = DownloadHandlerTexture.GetContent(request);
            onSuccess?.Invoke(texture);
        }

        // POST /api/panoIds — batch lookup
        public IEnumerator GetPanoIds(
            PanoLocation[] locations,
            int radius,
            Action<string[]> onSuccess,
            Action onFailure = null)
        {
            var body = new PanoIdsRequest { locations = locations, radius = radius };
            string json = JsonConvert.SerializeObject(body);
            byte[] bodyRaw = Encoding.UTF8.GetBytes(json);

            using var request = new UnityWebRequest($"{serverUrl}/api/panoIds", "POST");
            request.uploadHandler = new UploadHandlerRaw(bodyRaw);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");

            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError($"GetPanoIds failed: {request.error}");
                onFailure?.Invoke();
                yield break;
            }

            try
            {
                var response = JsonConvert.DeserializeObject<PanoIdsResponse>(
                    request.downloadHandler.text
                );
                onSuccess?.Invoke(response.panoIds);
            }
            catch (Exception e)
            {
                Debug.LogError($"Failed to parse panoIds: {e.Message}");
                onFailure?.Invoke();
            }
        }

        // Helper: build tile URL for external use
        public string GetTileUrl(int zoom, int x, int y, string panoId)
        {
            return $"{serverUrl}/api/tile/{zoom}/{x}/{y}?panoId={UnityWebRequest.EscapeURL(panoId)}";
        }

        // Helper: 3D tiles root URL
        public string Get3DTilesRootUrl()
        {
            return $"{serverUrl}/api/3dtiles/root.json";
        }
    }
}
