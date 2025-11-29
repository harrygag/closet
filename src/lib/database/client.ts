import { db, auth } from '../firebase/client';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as limitQuery,
  QueryConstraint,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';

// Database client that provides a similar API to Supabase but uses Firebase Firestore
export const database = {
  auth: {
    getUser: async () => {
      const currentUser = auth.currentUser;
      return {
        data: {
          user: currentUser ? {
            id: currentUser.uid,
            email: currentUser.email,
            created_at: currentUser.metadata.creationTime,
          } : null
        },
        error: null
      };
    },
    getSession: async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return { data: { session: null }, error: null };
      }

      const token = await currentUser.getIdToken();
      return {
        data: {
          session: {
            access_token: token,
            user: {
              id: currentUser.uid,
              email: currentUser.email,
            }
          }
        },
        error: null
      };
    }
  },

  from: (tableName: string) => {
    return {
      select: (_fields: string = '*') => {
        const constraints: QueryConstraint[] = [];
        const filters: any[] = [];
        let singleResult = false;

        const builder = {
          eq: (field: string, value: any) => {
            constraints.push(where(field, '==', value));
            return builder;
          },
          or: (_condition: string) => {
            // Handle 'barcode.is.null,barcode.eq.' pattern
            // For now, we'll just check for null or empty string
            constraints.push(where('barcode', 'in', [null, '']));
            return builder;
          },
          ilike: (field: string, pattern: string) => {
            // Firestore doesn't have ILIKE, so we'll do client-side filtering
            filters.push({ field, pattern: pattern.replace(/%/g, ''), type: 'ilike' });
            return builder;
          },
          gte: (field: string, value: any) => {
            constraints.push(where(field, '>=', value));
            return builder;
          },
          like: (field: string, pattern: string) => {
            filters.push({ field, pattern: pattern.replace(/%/g, ''), type: 'like' });
            return builder;
          },
          order: (field: string, options?: { ascending?: boolean }) => {
            constraints.push(orderBy(field, options?.ascending ? 'asc' : 'desc'));
            return builder;
          },
          limit: (count: number) => {
            constraints.push(limitQuery(count));
            return builder;
          },
          single: () => {
            singleResult = true;
            return builder;
          },
          maybeSingle: () => {
            singleResult = true;
            return builder;
          },
          then: (resolve: any) => {
            (async () => {
              try {
                const q = query(collection(db, tableName), ...constraints);
                const snapshot = await getDocs(q);

                let data = snapshot.docs.map(doc => ({
                  id: doc.id,
                  ...doc.data()
                }));

                // Apply client-side filters
                for (const filter of filters) {
                  if (filter.type === 'ilike' || filter.type === 'like') {
                    data = data.filter((item: any) => {
                      const fieldValue = String(item[filter.field] || '').toLowerCase();
                      const pattern = filter.pattern.toLowerCase();
                      return fieldValue.includes(pattern);
                    });
                  }
                }

                const result = singleResult ? (data[0] || null) : data;

                resolve({ data: result, error: null });
              } catch (error) {
                resolve({ data: null, error });
              }
            })();
          }
        };

        return builder;
      },

      insert: (data: any | any[]) => {
        return {
          select: () => {
            return {
              single: async () => {
                try {
                  const docRef = await addDoc(collection(db, tableName), {
                    ...data,
                    createdAt: serverTimestamp()
                  });
                  const docSnap = await getDoc(docRef);

                  return {
                    data: { id: docRef.id, ...docSnap.data() },
                    error: null
                  };
                } catch (error) {
                  return { data: null, error };
                }
              },
              then: (resolve: any) => {
                (async () => {
                  try {
                    const items = Array.isArray(data) ? data : [data];
                    const results = [];

                    for (const item of items) {
                      const docRef = await addDoc(collection(db, tableName), {
                        ...item,
                        createdAt: serverTimestamp()
                      });
                      const docSnap = await getDoc(docRef);
                      results.push({ id: docRef.id, ...docSnap.data() });
                    }

                    resolve({ data: results, error: null });
                  } catch (error) {
                    resolve({ data: null, error });
                  }
                })();
              }
            };
          }
        };
      },

      update: (data: any) => {
        const constraints: QueryConstraint[] = [];

        const builder = {
          eq: (field: string, value: any) => {
            constraints.push(where(field, '==', value));
            return builder;
          },
          select: () => {
            return {
              single: async () => {
                try {
                  const q = query(collection(db, tableName), ...constraints);
                  const snapshot = await getDocs(q);

                  if (snapshot.empty) {
                    return { data: null, error: new Error('No document found') };
                  }

                  const docRef = snapshot.docs[0].ref;
                  await updateDoc(docRef, {
                    ...data,
                    updated_at: serverTimestamp()
                  });

                  const updatedDoc = await getDoc(docRef);
                  return {
                    data: { id: updatedDoc.id, ...updatedDoc.data() },
                    error: null
                  };
                } catch (error) {
                  return { data: null, error };
                }
              }
            };
          },
          then: (resolve: any) => {
            (async () => {
              try {
                const q = query(collection(db, tableName), ...constraints);
                const snapshot = await getDocs(q);

                for (const docSnap of snapshot.docs) {
                  await updateDoc(docSnap.ref, {
                    ...data,
                    updated_at: serverTimestamp()
                  });
                }

                resolve({ data: null, error: null });
              } catch (error) {
                resolve({ data: null, error });
              }
            })();
          }
        };

        return builder;
      },

      upsert: (data: any, options?: { onConflict: string }) => {
        return {
          then: (resolve: any) => {
            (async () => {
              try {
                // For upsert, we'll use the conflict field as the document ID
                if (options?.onConflict && data[options.onConflict]) {
                  const docRef = doc(db, tableName, data[options.onConflict]);
                  await setDoc(docRef, {
                    ...data,
                    updated_at: serverTimestamp()
                  }, { merge: true });

                  resolve({ data: null, error: null });
                } else {
                  const docRef = await addDoc(collection(db, tableName), {
                    ...data,
                    createdAt: serverTimestamp()
                  });
                  resolve({ data: { id: docRef.id }, error: null });
                }
              } catch (error) {
                resolve({ data: null, error });
              }
            })();
          }
        };
      },

      delete: () => {
        const constraints: QueryConstraint[] = [];

        const builder = {
          eq: (field: string, value: any) => {
            constraints.push(where(field, '==', value));
            return builder;
          },
          then: (resolve: any) => {
            (async () => {
              try {
                const q = query(collection(db, tableName), ...constraints);
                const snapshot = await getDocs(q);

                for (const docSnap of snapshot.docs) {
                  await deleteDoc(docSnap.ref);
                }

                resolve({ data: null, error: null });
              } catch (error) {
                resolve({ data: null, error });
              }
            })();
          }
        };

        return builder;
      }
    };
  }
};

// Export for compatibility
export { database as db };
