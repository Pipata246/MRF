-- Raise avatars bucket limit for prepared high-quality uploads (square webp/jpeg ~1024)
update storage.buckets
set file_size_limit = 3145728
where id = 'avatars';
