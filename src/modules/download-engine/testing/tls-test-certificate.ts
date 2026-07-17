/**
 * Self-signed certificate for the in-process TLS test servers (fake NNTP).
 * Test fixture only — the private key is intentionally public. Valid for
 * DNS:localhost, DNS:dns-rebind.invalid, IP:127.0.0.1, and IP:::1 until 2126.
 */

export const tlsTestCertificate = `-----BEGIN CERTIFICATE-----
MIIB9TCCAZugAwIBAgIUYFHX9RsuW5R2X0Du+tvASQvfBHMwCgYIKoZIzj0EAwIw
HDEaMBgGA1UEAwwRbm9va2xldC1ubnRwLXRlc3QwIBcNMjYwNzE3MTgwODMwWhgP
MjEyNjA2MjMxODA4MzBaMBwxGjAYBgNVBAMMEW5vb2tsZXQtbm50cC10ZXN0MFkw
EwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEdpKkdjAXtSWqkOa5zCqWyqo+ia4qsqHj
vL0BxLmDQ99pV4UqwVNHUBUnD9wLsXzu0rICHJqJhGaxrwQLNOZcI6OBuDCBtTAd
BgNVHQ4EFgQUfNB3yuPyDpypdokoAWtpr6jc3VQwHwYDVR0jBBgwFoAUfNB3yuPy
DpypdokoAWtpr6jc3VQwQAYDVR0RBDkwN4IJbG9jYWxob3N0ghJkbnMtcmViaW5k
LmludmFsaWSHBH8AAAGHEAAAAAAAAAAAAAAAAAAAAAEwDwYDVR0TAQH/BAUwAwEB
/zALBgNVHQ8EBAMCAoQwEwYDVR0lBAwwCgYIKwYBBQUHAwEwCgYIKoZIzj0EAwID
SAAwRQIhANbENfPyMde+GZx4wHf98KtrXUTsdlhivG7hkmBwYe/mAiBZLNly+jHs
Sz9d03Kr3JsYt2owDsOyL+KxjNz9dsrE4A==
-----END CERTIFICATE-----
`;

export const tlsTestPrivateKey = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgtuWhz54oVP1knnfy
J9qwVaSN1L5vZIXxqCV7Z9OwRJyhRANCAAR2kqR2MBe1JaqQ5rnMKpbKqj6Jriqy
oeO8vQHEuYND32lXhSrBU0dQFScP3AuxfO7SsgIcmomEZrGvBAs05lwj
-----END PRIVATE KEY-----
`;
