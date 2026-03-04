using System;
using System.Collections;
using UnityEngine;

namespace OpenEarthVR.Core
{
    public enum AppState { Globe, Transitioning, Photosphere }

    public class AppStateMachine : MonoBehaviour
    {
        public static AppStateMachine Instance { get; private set; }

        [Header("References")]
        [SerializeField] private GameObject globeRoot;
        [SerializeField] private GameObject panoSphereRoot;
        [SerializeField] private GameObject navOrbContainer;
        [SerializeField] private FadeOverlay fadeOverlay;
        [SerializeField] private CopyrightBadge copyrightBadge;

        [Header("Globe")]
        [SerializeField] private GlobeManager globeManager;

        [Header("Photosphere")]
        [SerializeField] private PanoSphere panoSphere;
        [SerializeField] private TileLoader tileLoader;
        [SerializeField] private NavOrbs navOrbs;

        public AppState CurrentState { get; private set; } = AppState.Globe;

        public event Action<AppState> OnStateChanged;

        private Vector2 lastPanoLocation;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
        }

        private IEnumerator Start()
        {
            // Initialize session with server
            yield return ApiClient.Instance.CreateSession();

            // Start in globe mode
            SetGlobeActive(true);
            SetPanoActive(false);
            copyrightBadge.Hide();
        }

        public void EnterPhotosphere(double lat, double lng, string panoId = null)
        {
            if (CurrentState == AppState.Transitioning) return;
            StartCoroutine(EnterPhotosphereRoutine(lat, lng, panoId));
        }

        public void ReturnToGlobe()
        {
            if (CurrentState == AppState.Transitioning) return;
            StartCoroutine(ReturnToGlobeRoutine());
        }

        private IEnumerator EnterPhotosphereRoutine(double lat, double lng, string panoId)
        {
            SetState(AppState.Transitioning);

            // If coming from globe, fly down first
            if (globeRoot.activeSelf)
            {
                lastPanoLocation = new Vector2((float)lat, (float)lng);
                yield return globeManager.FlyToLocation(lat, lng, 150.0, 2.5f);
            }

            // Fade to black
            yield return fadeOverlay.FadeIn(0.4f);

            // Swap views
            SetGlobeActive(false);
            SetPanoActive(true);
            copyrightBadge.Hide();

            // Reset photosphere
            panoSphere.Reset();
            navOrbs.ClearOrbs();

            // Fetch metadata
            PanoMetadata metadata;
            if (!string.IsNullOrEmpty(panoId))
                metadata = yield return ApiClient.Instance.GetMetadata(panoId: panoId);
            else
                metadata = yield return ApiClient.Instance.GetMetadata(lat: lat, lng: lng);

            // Use coroutine wrapper to get metadata
            PanoMetadata fetchedMeta = null;
            bool metaFailed = false;

            yield return ApiClient.Instance.GetMetadataCoroutine(
                lat, lng, panoId,
                result => fetchedMeta = result,
                () => metaFailed = true
            );

            if (metaFailed || fetchedMeta == null)
            {
                Debug.LogWarning("No Street View coverage at this location");
                yield return new WaitForSeconds(1.2f);
                yield return fadeOverlay.FadeOut(0.4f);
                SetGlobeActive(true);
                SetPanoActive(false);
                SetState(AppState.Globe);
                yield break;
            }

            lastPanoLocation = new Vector2(
                (float)fetchedMeta.location.lat,
                (float)fetchedMeta.location.lng
            );

            // Set up nav orbs
            if (fetchedMeta.links != null && fetchedMeta.links.Length > 0)
            {
                navOrbs.SpawnOrbs(fetchedMeta.links, fetchedMeta.heading, link =>
                {
                    EnterPhotosphere(
                        fetchedMeta.location.lat,
                        fetchedMeta.location.lng,
                        link.panoId
                    );
                });
            }

            // Load tiles progressively
            bool coarseLoaded = false;

            yield return tileLoader.LoadTilesProgressive(
                fetchedMeta,
                // Coarse callback
                coarseTex =>
                {
                    panoSphere.ApplyTexture(coarseTex, fetchedMeta.heading);
                    copyrightBadge.Show(fetchedMeta.copyright);
                    coarseLoaded = true;
                    StartCoroutine(fadeOverlay.FadeOut(0.4f));
                    SetState(AppState.Photosphere);
                },
                // Fine callback
                fineTex =>
                {
                    panoSphere.ApplyTexture(fineTex, fetchedMeta.heading);
                }
            );

            // If coarse wasn't loaded yet (edge case), wait
            if (!coarseLoaded)
            {
                yield return fadeOverlay.FadeOut(0.4f);
                SetState(AppState.Photosphere);
            }
        }

        private IEnumerator ReturnToGlobeRoutine()
        {
            SetState(AppState.Transitioning);

            // Fade to black
            yield return fadeOverlay.FadeIn(0.4f);

            // Swap views
            SetPanoActive(false);
            copyrightBadge.Hide();
            navOrbs.ClearOrbs();

            // Position camera above last pano location
            globeManager.PositionCameraAbove(
                lastPanoLocation.x, lastPanoLocation.y, 500.0
            );

            SetGlobeActive(true);

            // Fade from black
            yield return fadeOverlay.FadeOut(0.4f);

            SetState(AppState.Globe);
        }

        private void SetState(AppState newState)
        {
            CurrentState = newState;
            OnStateChanged?.Invoke(newState);
        }

        private void SetGlobeActive(bool active)
        {
            if (globeRoot != null) globeRoot.SetActive(active);
        }

        private void SetPanoActive(bool active)
        {
            if (panoSphereRoot != null) panoSphereRoot.SetActive(active);
            if (navOrbContainer != null) navOrbContainer.SetActive(active);
        }
    }
}
