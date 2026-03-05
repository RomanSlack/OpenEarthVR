using System.Collections;
using UnityEngine;

namespace OpenEarthVR.Core
{
    /// <summary>
    /// Globe manager stub. Once Cesium for Unity is installed:
    /// 1. Add 'CesiumRuntime' to OpenEarthVR.asmdef references
    /// 2. Uncomment the Cesium code blocks below
    /// </summary>
    public class GlobeManager : MonoBehaviour
    {
        // TODO: Uncomment when Cesium for Unity is installed
        // [Header("Cesium")]
        // [SerializeField] private CesiumForUnity.CesiumGeoreference georeference;
        // [SerializeField] private CesiumForUnity.Cesium3DTileset tileset;

        [Header("Camera")]
        [SerializeField] private Transform vrCamera;

        private bool isInitialized;

        private IEnumerator Start()
        {
            yield return null;

            if (ApiClient.Instance == null)
            {
                Debug.LogError("ApiClient not found in scene");
                yield break;
            }

            Debug.Log("GlobeManager ready. Cesium integration pending package install.");
            isInitialized = true;
        }

        public IEnumerator FlyToLocation(double lat, double lng, double altitude, float duration)
        {
            // TODO: Cesium fly-to animation
            // When Cesium is installed, convert lat/lng/alt to ECEF via
            // CesiumWgs84Ellipsoid and lerp georeference origin.
            Debug.Log($"FlyToLocation: {lat:F4}, {lng:F4}, alt={altitude}");
            yield return new WaitForSeconds(duration);
        }

        public void PositionCameraAbove(double lat, double lng, double altitude)
        {
            // TODO: Set georeference origin to ECEF position
            Debug.Log($"PositionCameraAbove: {lat:F4}, {lng:F4}, alt={altitude}");

            if (vrCamera != null)
            {
                vrCamera.localPosition = Vector3.zero;
                vrCamera.localRotation = Quaternion.Euler(60f, 0f, 0f);
            }
        }

        public bool RaycastGlobe(Ray ray, out double hitLat, out double hitLng)
        {
            hitLat = 0;
            hitLng = 0;

            if (Physics.Raycast(ray, out RaycastHit hit, 100000f))
            {
                // TODO: Convert hit.point to ECEF via georeference,
                // then ECEF to lat/lng via CesiumWgs84Ellipsoid
                hitLat = hit.point.z;
                hitLng = hit.point.x;
                return true;
            }

            return false;
        }
    }
}
