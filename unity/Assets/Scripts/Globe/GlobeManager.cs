using System.Collections;
using CesiumForUnity;
using Unity.Mathematics;
using UnityEngine;

namespace OpenEarthVR.Core
{
    public class GlobeManager : MonoBehaviour
    {
        [Header("Cesium")]
        [SerializeField] private CesiumGeoreference georeference;
        [SerializeField] private Cesium3DTileset tileset;
        [SerializeField] private CesiumCameraManager cameraManager;

        [Header("Camera")]
        [SerializeField] private Transform vrCamera;

        private bool isInitialized;

        private IEnumerator Start()
        {
            // Wait a frame for ApiClient to be ready
            yield return null;

            if (ApiClient.Instance == null)
            {
                Debug.LogError("ApiClient not found in scene");
                yield break;
            }

            // Configure Cesium 3D Tileset to use our proxy server
            if (tileset != null)
            {
                // Cesium for Unity uses its own tile loading system.
                // The tileset URL is configured in the Inspector to point
                // at our proxy: http://localhost:3001/api/3dtiles/root.json
                // This is set via the CesiumIonRasterOverlay or custom URL.
                Debug.Log("Globe tileset configured via Inspector URL");
            }

            isInitialized = true;
        }

        /// <summary>
        /// Fly the camera to a lat/lng at a given altitude over a duration.
        /// </summary>
        public IEnumerator FlyToLocation(double lat, double lng, double altitude, float duration)
        {
            if (georeference == null) yield break;

            // Convert target geodetic to ECEF
            double3 targetEcef = CesiumWgs84Ellipsoid.LongitudeLatitudeHeightToEarthCenteredEarthFixed(
                new double3(lng, lat, altitude)
            );

            // Get current camera ECEF position
            double3 startEcef = GetCameraEcef();

            float elapsed = 0f;
            while (elapsed < duration)
            {
                elapsed += Time.deltaTime;
                float t = Mathf.Clamp01(elapsed / duration);
                // Smooth ease-in-out
                t = t * t * (3f - 2f * t);

                double3 currentEcef = math.lerp(startEcef, targetEcef, t);

                // Update georeference origin to keep precision
                georeference.SetOriginEarthCenteredEarthFixed(
                    currentEcef.x, currentEcef.y, currentEcef.z
                );

                yield return null;
            }

            // Snap to final position
            georeference.SetOriginEarthCenteredEarthFixed(
                targetEcef.x, targetEcef.y, targetEcef.z
            );
        }

        /// <summary>
        /// Instantly position the camera above a lat/lng at given altitude.
        /// Used when returning to globe from photosphere.
        /// </summary>
        public void PositionCameraAbove(double lat, double lng, double altitude)
        {
            if (georeference == null) return;

            double3 ecef = CesiumWgs84Ellipsoid.LongitudeLatitudeHeightToEarthCenteredEarthFixed(
                new double3(lng, lat, altitude)
            );

            georeference.SetOriginEarthCenteredEarthFixed(ecef.x, ecef.y, ecef.z);

            // Reset camera to look down
            if (vrCamera != null)
            {
                vrCamera.localPosition = Vector3.zero;
                vrCamera.localRotation = Quaternion.Euler(60f, 0f, 0f); // Look slightly down
            }
        }

        /// <summary>
        /// Raycast from a world-space ray against the globe tileset.
        /// Returns true if hit, with lat/lng output.
        /// </summary>
        public bool RaycastGlobe(Ray ray, out double hitLat, out double hitLng)
        {
            hitLat = 0;
            hitLng = 0;

            if (Physics.Raycast(ray, out RaycastHit hit, 100000f))
            {
                // Convert Unity world hit point to ECEF via georeference
                double3 unityPos = new double3(hit.point.x, hit.point.y, hit.point.z);
                double3 ecef = georeference.TransformUnityPositionToEarthCenteredEarthFixed(unityPos);

                // Convert ECEF to geodetic
                double3 llh = CesiumWgs84Ellipsoid.EarthCenteredEarthFixedToLongitudeLatitudeHeight(ecef);
                hitLng = llh.x;
                hitLat = llh.y;
                return true;
            }

            return false;
        }

        private double3 GetCameraEcef()
        {
            if (vrCamera == null) return double3.zero;

            double3 unityPos = new double3(
                vrCamera.position.x,
                vrCamera.position.y,
                vrCamera.position.z
            );
            return georeference.TransformUnityPositionToEarthCenteredEarthFixed(unityPos);
        }
    }
}
