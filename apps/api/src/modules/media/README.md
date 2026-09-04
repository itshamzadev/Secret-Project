# Media

Authenticated direct-conversation media uploads are handled here. The module
validates file signatures, stores media through the `MediaStorage` abstraction,
and creates ordinary `Message` documents containing metadata plus a storage
reference. The default development adapter writes to `MEDIA_STORAGE_PATH`;
production deployments need a persistent volume or an S3-compatible adapter.
