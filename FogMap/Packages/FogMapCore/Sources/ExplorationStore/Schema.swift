import Foundation
import GRDB

/// Ported directly from Build Spec section 5. `segments` is included for
/// completeness (M2 fog rendering reads from it) but nothing in M1 writes to it yet.
enum Schema {
    static func migrator() -> DatabaseMigrator {
        var migrator = DatabaseMigrator()

        migrator.registerMigration("v1") { db in
            try db.create(table: "fixes") { t in
                t.autoIncrementedPrimaryKey("id")
                t.column("timestamp", .integer).notNull()
                t.column("latitude", .double).notNull()
                t.column("longitude", .double).notNull()
                t.column("accuracy", .double).notNull()
                t.column("speed", .double)
                t.column("activity", .text)
                t.column("source", .text)
            }
            try db.create(index: "idx_fixes_time", on: "fixes", columns: ["timestamp"])

            try db.create(table: "explored_cells") { t in
                t.column("h3_index", .text).notNull().primaryKey()
                t.column("first_seen", .integer).notNull()
                t.column("last_seen", .integer).notNull()
                t.column("visit_count", .integer).notNull().defaults(to: 1)
            }
            try db.create(index: "idx_cells_seen", on: "explored_cells", columns: ["first_seen"])

            try db.create(table: "segments") { t in
                t.autoIncrementedPrimaryKey("id")
                t.column("started_at", .integer).notNull()
                t.column("ended_at", .integer)
                t.column("activity", .text)
                t.column("geometry", .blob)
            }
        }

        return migrator
    }
}
