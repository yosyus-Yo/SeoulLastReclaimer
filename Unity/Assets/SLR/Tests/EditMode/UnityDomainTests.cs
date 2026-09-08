using NUnit.Framework;

namespace SLR.Tests
{
    public sealed class UnityDomainTests
    {
        [Test]
        public void AllDomainChecks()
        {
            foreach (var test in DomainChecks.Cases()) Assert.DoesNotThrow(() => test.run(), test.name);
        }
    }
}
