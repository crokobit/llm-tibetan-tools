const { S3Client, ListObjectVersionsCommand, DeleteObjectsCommand, DeleteBucketCommand } = require('@aws-sdk/client-s3');

const client = new S3Client({ region: 'us-east-1' });
const BUCKET_NAME = 'cdk-hnb659fds-assets-211125771921-us-east-1';

async function emptyBucket(bucketName) {
    let hasMore = true;
    while (hasMore) {
        const list = await client.send(new ListObjectVersionsCommand({ Bucket: bucketName }));

        const objectsToDelete = [];
        if (list.Versions) {
            objectsToDelete.push(...list.Versions.map(v => ({ Key: v.Key, VersionId: v.VersionId })));
        }
        if (list.DeleteMarkers) {
            objectsToDelete.push(...list.DeleteMarkers.map(m => ({ Key: m.Key, VersionId: m.VersionId })));
        }

        if (objectsToDelete.length > 0) {
            console.log(`Deleting ${objectsToDelete.length} items...`);
            await client.send(new DeleteObjectsCommand({
                Bucket: bucketName,
                Delete: { Objects: objectsToDelete }
            }));
        } else {
            hasMore = false;
        }

        // If truncated, loop again (ListObjectVersions is paginated)
        if (!list.IsTruncated) {
            hasMore = false;
        }
    }
}

async function main() {
    try {
        console.log(`Emptying bucket ${BUCKET_NAME}...`);
        await emptyBucket(BUCKET_NAME);
        console.log('Deleting bucket...');
        await client.send(new DeleteBucketCommand({ Bucket: BUCKET_NAME }));
        console.log('Bucket deleted successfully.');
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
}

main();
