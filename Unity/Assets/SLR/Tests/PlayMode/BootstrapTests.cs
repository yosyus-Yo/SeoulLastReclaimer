using System.Collections;
using NUnit.Framework;
using SLR.Runtime;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace SLR.Tests
{
    public sealed class BootstrapTests
    {
        [UnityTest]
        public IEnumerator BootstrapCreatesCameraAndPausedTitle()
        {
            yield return SceneManager.LoadSceneAsync("Bootstrap");
            yield return null;
            var controller = Object.FindFirstObjectByType<MissionController>();
            Assert.That(controller, Is.Not.Null);
            Assert.That(Camera.main, Is.Not.Null);
            Assert.That(Camera.main.orthographic, Is.True);
            Assert.That(controller.Started, Is.False);
            var start = controller.Simulation.State.player;
            yield return new WaitForSeconds(.1f);
            Assert.That(controller.Simulation.State.time, Is.Zero, "Title must not advance the simulation");
            Assert.That(controller.Simulation.State.player.x, Is.EqualTo(start.x));
            LogAssert.NoUnexpectedReceived();
        }
    }
}
